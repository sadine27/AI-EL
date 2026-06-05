"""
Smart Parking AI - Enhanced Python API
FastAPI application that orchestrates Google API collectors and C++ engine.
Includes comprehensive security hardening: rate limiting, IP blocking, security headers,
input sanitization, audit logging, and API key validation.
"""

import os
import json
import re
import uuid
import logging
import httpx
import asyncio
import time
from datetime import datetime, timezone
from collections import defaultdict
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smart-parking-api")

# ------------------------------------------------------------
# Security: API Key validation
# ------------------------------------------------------------
GOOGLE_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

def is_valid_api_key(key: str) -> bool:
    """Validate API key format: alphanumeric with optional dashes/underscores, 20+ chars."""
    if not key or len(key) < 20:
        return False
    return bool(re.match(r'^[A-Za-z0-9_-]{20,}$', key))

# ------------------------------------------------------------
# Security: Rate limiter (in-memory, per-IP sliding window)
# ------------------------------------------------------------
class RateLimiter:
    """Simple in-memory rate limiter using sliding window."""
    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.clients: dict = defaultdict(list)

    def is_allowed(self, client_ip: str) -> bool:
        now = time.time()
        window_start = now - self.window_seconds
        # Prune old entries
        self.clients[client_ip] = [t for t in self.clients[client_ip] if t > window_start]
        if len(self.clients[client_ip]) >= self.max_requests:
            return False
        self.clients[client_ip].append(now)
        return True

rate_limiter = RateLimiter(max_requests=60, window_seconds=60)

# ------------------------------------------------------------
# Security: IP allowlist / blocklist
# ------------------------------------------------------------
BLOCKED_IPS = set(os.getenv("BLOCKED_IPS", "").split(",")) if os.getenv("BLOCKED_IPS") else set()
ALLOWED_IPS = set(os.getenv("ALLOWED_IPS", "").split(",")) if os.getenv("ALLOWED_IPS") else set()

def is_ip_blocked(client_ip: str) -> bool:
    """Check if IP is explicitly blocked, or if allowlist is set and IP not on it."""
    if client_ip in BLOCKED_IPS:
        return True
    if ALLOWED_IPS and client_ip not in ALLOWED_IPS:
        return True
    return False

# ------------------------------------------------------------
# App initialization with middleware
# ------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Smart Parking AI API starting up")
    yield
    logger.info("Smart Parking AI API shutting down")

app = FastAPI(
    title="Smart Parking AI API",
    version="2.0.0",
    description="Enhanced C++ + Python parking availability prediction engine",
    lifespan=lifespan,
    docs_url="/api/docs" if os.getenv("ENABLE_DOCS", "0") == "1" else None,
    redoc_url=None,
)

# ------------------------------------------------------------
# Security: CORS (tightened)
# ------------------------------------------------------------
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:8080,http://localhost:3000")
origins_list = [o.strip() for o in ALLOWED_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_list if origins_list else [],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)

# ------------------------------------------------------------
# Security: Trusted Host middleware
# ------------------------------------------------------------
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1")
hosts_list = [h.strip() for h in ALLOWED_HOSTS.split(",") if h.strip()]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts_list)

# ------------------------------------------------------------
# Security: Middleware for IP blocking + rate limiting + security headers
# ------------------------------------------------------------
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "form-action 'self'; "
        "base-uri 'self';"
    ),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self), microphone=(), camera=()",
    "Cache-Control": "no-store, max-age=0",
}

@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Get client IP (respecting proxies)
    forwarded = request.headers.get("X-Forwarded-For", "")
    client_ip = (
        forwarded.split(",")[0].strip()
        if forwarded
        else (request.client.host if request.client else "unknown")
    )

    # Generate or propagate request ID for audit trail correlation
    request_id = request.headers.get("X-Request-ID", "")
    if not request_id:
        request_id = str(uuid.uuid4())

    # Security: IP blocking
    if client_ip != "unknown" and is_ip_blocked(client_ip):
        logger.warning(f"[{request_id}] Blocked request from IP: {client_ip}")
        return JSONResponse(
            status_code=403,
            content={"detail": "Access denied", "code": "IP_BLOCKED", "requestId": request_id}
        )

    # Security: Rate limiting (skip for health check)
    if request.url.path != "/api/health":
        if client_ip != "unknown" and not rate_limiter.is_allowed(client_ip):
            logger.warning(f"[{request_id}] Rate limit exceeded for IP: {client_ip}")
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests",
                    "code": "RATE_LIMITED",
                    "retryAfterSeconds": 60,
                    "requestId": request_id,
                },
            )

    # Security: Validate request body size (max 1MB)
    if request.method in ("POST", "PUT", "PATCH"):
        content_length = request.headers.get("content-length", 0)
        try:
            if int(content_length) > 1_048_576:  # 1MB
                return JSONResponse(
                    status_code=413,
                    content={
                        "detail": "Request entity too large",
                        "code": "PAYLOAD_TOO_LARGE",
                        "requestId": request_id,
                    },
                )
        except (ValueError, TypeError):
            pass

    # Process request
    start_time = time.time()
    try:
        response = await call_next(request)
    except Exception as e:
        logger.error(f"[{request_id}] Unhandled exception: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "code": "INTERNAL_ERROR",
                "requestId": request_id,
            },
        )

    # Security: Add security headers + request ID
    for header, value in SECURITY_HEADERS.items():
        response.headers[header] = value
    response.headers["X-Request-ID"] = request_id

    # Audit logging for API endpoints
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        duration = time.time() - start_time
        logger.info(
            f"[AUDIT] [{request_id}] {client_ip} {request.method} {request.url.path} "
            f"{response.status_code} {duration:.3f}s"
        )

    return response

# ------------------------------------------------------------
# Security: Sanitize input for logging (prevent log injection)
# ------------------------------------------------------------
def sanitize_log(value: str, max_len: int = 100) -> str:
    """Sanitize a string for safe logging - strip newlines and truncate."""
    if not isinstance(value, str):
        value = str(value)
    sanitized = value.replace("\n", "\\n").replace("\r", "\\r")
    return sanitized[:max_len]

# ------------------------------------------------------------
# Security: Sanitize API key from URLs in log messages
# ------------------------------------------------------------
def redact_api_key(url: str) -> str:
    """Remove API key from log messages."""
    if not isinstance(url, str):
        return str(url)
    return re.sub(r'key=[A-Za-z0-9_-]{20,}', 'key=REDACTED', url)

# Serve static frontend (disabled in tests via SERVE_FRONTEND=0)
if os.getenv("SERVE_FRONTEND", "1") == "1":
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
    if os.path.isdir(frontend_path):
        app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")

# Google API key
CPP_ENGINE_URL = f"http://localhost:{os.getenv('CPP_ENGINE_PORT', '5001')}"

# ------------------------------------------------------------
# Pydantic Models with Edge Case Validation
# ------------------------------------------------------------
class PredictionRequest(BaseModel):
    lat: float = Field(default=19.0760, description="Latitude (-90 to 90)")
    lng: float = Field(default=72.8777, description="Longitude (-180 to 180)")
    totalSlots: int = Field(default=10, ge=1, le=1000, description="Total parking slots (1-1000)")
    unavailable: int = Field(default=3, ge=0, description="Currently occupied slots")
    hour: int | None = Field(default=None, ge=0, le=23, description="Hour of day (0-23)")
    dayOfWeek: int | None = Field(default=None, ge=0, le=6, description="Day of week (0=Mon, 6=Sun)")

    @field_validator("lat")
    @classmethod
    def validate_lat(cls, v):
        if v < -90.0 or v > 90.0:
            raise ValueError("Latitude must be between -90 and 90")
        return v

    @field_validator("lng")
    @classmethod
    def validate_lng(cls, v):
        if v < -180.0 or v > 180.0:
            raise ValueError("Longitude must be between -180 and 180")
        return v

    @field_validator("unavailable")
    @classmethod
    def validate_unavailable(cls, v, info):
        total = info.data.get("totalSlots", 10)
        if v > total:
            raise ValueError(f"unavailable ({v}) cannot exceed totalSlots ({total})")
        return v

class ApiStatus(BaseModel):
    api: str
    status: str
    data: dict | None = None
    error: str | None = None

# ------------------------------------------------------------
# Safe nested dict accessor
# ------------------------------------------------------------
def safe_get_nested(d: dict, *keys, default=0.0):
    """Safely traverse nested dictionaries without KeyError."""
    current = d
    for key in keys:
        if not isinstance(current, dict):
            return default
        current = current.get(key, default)
        if current is None:
            return default
    return current

# ------------------------------------------------------------
# Signal Collection
# ------------------------------------------------------------
async def collect_signal(name: str, coro):
    """Collect a signal, returning status + data or error."""
    try:
        data = await coro
        return {"name": name, "status": "ready", "data": data}
    except Exception as e:
        logger.warning(f"Signal {name} failed: {sanitize_log(str(e))}")
        return {"name": name, "status": "error", "error": str(e)}

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": "2.0.0",
        "engine": "smart-parking-cpp",
        "apiKeyConfigured": bool(GOOGLE_API_KEY)
    }

@app.get("/api/signals")
async def get_available_signals():
    """Return the catalog of available Google API signals."""
    from collectors import API_CATALOG
    return [
        {"api": api["name"], "status": "available", "data": api, "error": None}
        for api in API_CATALOG
    ]

@app.post("/api/collect-signals")
async def collect_signals(request: PredictionRequest):
    """Collect live signals from Google APIs and return them."""
    from collectors import CATALOG

    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=400, detail="Google API key not configured")

    now = datetime.now(timezone.utc)

    center = {"lat": request.lat, "lng": request.lng}

    # Import collectors
    from collectors.places import fetch_nearby_places
    from collectors.weather import fetch_weather
    from collectors.environment import fetch_air_quality, fetch_pollen
    from collectors.geolocation import fetch_geocoding, fetch_timezone, fetch_elevation
    from collectors.routing import fetch_distance_matrix, fetch_routes, fetch_roads

    # Collect all signals concurrently
    results = await asyncio.gather(
        collect_signal("Places API (New)", fetch_nearby_places(center, GOOGLE_API_KEY)),
        collect_signal("Weather API", fetch_weather(center, GOOGLE_API_KEY)),
        collect_signal("Air Quality API", fetch_air_quality(center, GOOGLE_API_KEY)),
        collect_signal("Pollen API", fetch_pollen(center, GOOGLE_API_KEY)),
        collect_signal("Geocoding API", fetch_geocoding(center, GOOGLE_API_KEY)),
        collect_signal("Time Zone API", fetch_timezone(center, GOOGLE_API_KEY)),
        collect_signal("Maps Elevation API", fetch_elevation(center, GOOGLE_API_KEY)),
        collect_signal("Roads API", fetch_roads(center, GOOGLE_API_KEY)),
        collect_signal("Distance Matrix API",
            fetch_distance_matrix(center, GOOGLE_API_KEY, user_location=center)),
        collect_signal("Routes API",
            fetch_routes(center, GOOGLE_API_KEY, user_location=center)),
    )

    # Build API catalog
    catalog = []
    for api_entry in CATALOG:
        matched = next((r for r in results if r["name"] == api_entry["name"]), None)
        if matched:
            catalog.append({**api_entry, "status": matched["status"],
                            "error": matched.get("error", "")})
        elif api_entry.get("mode") == "context":
            catalog.append({**api_entry, "status": "context"})
        else:
            catalog.append({**api_entry, "status": "planned"})

    places_signal = next((r for r in results if r["name"] == "Places API (New)"), None)

    return {
        "source": "google-maps-platform-signals",
        "updatedAt": now.isoformat(),
        "places": (places_signal["data"]["places"]
                   if places_signal and places_signal["status"] == "ready"
                   and places_signal.get("data") else []),
        "signals": results,
        "apiCatalog": catalog,
        "activeApiCount": sum(1 for c in catalog if c["status"] in ("ready", "derived", "context")),
        "readyApiCount": sum(1 for c in catalog if c["status"] == "ready"),
        "failedApiCount": sum(1 for c in catalog if c["status"] == "error"),
    }

@app.post("/api/predict")
async def predict(request: PredictionRequest):
    """
    Full prediction pipeline:
    1. Collect Google API signals
    2. Send features to C++ engine
    3. Return prediction with breakdown
    Handles: API failure, C++ engine timeout, missing data, edge inputs.
    """
    now = datetime.now(timezone.utc)
    hour = request.hour if request.hour is not None else now.hour
    day_of_week = request.dayOfWeek if request.dayOfWeek is not None else now.weekday()

    # Collect signals
    signal_data = {"signals": [], "places": []}
    if GOOGLE_API_KEY:
        try:
            signal_data = await collect_signals(request)
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Signal collection failed: {sanitize_log(str(e))}")

    # Safely extract features
    places = signal_data.get("places", []) if signal_data else []
    try:
        environment = extract_environment(signal_data.get("signals", []))
    except Exception as e:
        logger.warning(f"Environment extraction failed: {sanitize_log(str(e))}")
        environment = get_default_environment()

    try:
        route = extract_route(signal_data.get("signals", []))
    except Exception as e:
        logger.warning(f"Route extraction failed: {sanitize_log(str(e))}")
        route = get_default_route()

    # Build request for C++ engine
    cpp_payload = {
        "totalSlots": request.totalSlots,
        "unavailable": request.unavailable,
        "hour": hour,
        "dayOfWeek": day_of_week,
        "places": places,
        "environment": environment,
        "route": route
    }

    # Call C++ engine
    prediction = await call_cpp_engine(cpp_payload)

    if prediction is None:
        # Fallback: Python-side prediction
        prediction = fallback_prediction(
            request.totalSlots, request.unavailable,
            places, environment, route, hour, day_of_week
        )

    # Add API summary with safe defaults
    prediction["apiSummary"] = {
        "readyCount": signal_data.get("readyApiCount", 0) if signal_data else 0,
        "failedCount": signal_data.get("failedApiCount", 0) if signal_data else 0,
        "totalApis": 33
    }

    return prediction


async def call_cpp_engine(payload: dict) -> dict | None:
    """Send prediction request to C++ engine with timeout."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(f"{CPP_ENGINE_URL}/predict", json=payload)
            if resp.status_code == 200:
                body = resp.json()
                # Validate response has required fields
                if "predictedAvailable" in body:
                    return body
                logger.warning("C++ engine returned incomplete response")
    except httpx.TimeoutException:
        logger.warning("C++ engine request timed out after 5s")
    except httpx.ConnectError:
        logger.warning("C++ engine is unreachable")
    except Exception as e:
        logger.warning(f"C++ engine call failed: {sanitize_log(str(e))}")
    return None


def fallback_prediction(total_slots, unavailable, places, env, route, hour, day):
    """Python fallback if C++ engine is unavailable or returns invalid data."""
    from collectors.places import compute_demand_score
    from collectors.environment import compute_environment_score
    from collectors.routing import compute_route_score

    n_places = len(places) if places else 0
    demand_score = compute_demand_score(places, hour, day) if n_places > 0 else 0.28
    env_score = compute_environment_score(env) if env else 0.0
    route_score = compute_route_score(route) if route else 0.0
    live_occ = unavailable / max(total_slots, 1)

    occ_ratio = (
        live_occ * 0.32 +
        demand_score * 0.20 +
        0.14 * 0.14 +  # historical pressure placeholder
        env_score * 0.09 +
        route_score * 0.08
    )

    occ_ratio = max(0.0, min(1.0, occ_ratio))
    predicted_avail = max(0, min(total_slots,
        round(total_slots * (1 - occ_ratio))))

    demand_label = "Heavy" if demand_score >= 0.7 else \
                   "Moderate" if demand_score >= 0.42 else "Light"
    risk_label = "High" if live_occ >= 0.55 else \
                 "Moderate" if live_occ >= 0.42 else "Low"

    return {
        "predictedAvailable": predicted_avail,
        "predictedOccupancyPct": round(occ_ratio * 100),
        "riskLabel": risk_label,
        "demandLabel": demand_label,
        "demandScore": round(demand_score, 3),
        "confidencePct": 65,
        "horizonMinutes": 30,
        "liveAvailable": total_slots - unavailable,
        "modelBreakdown": {
            "decisionTree": risk_label,
            "decisionTreeScore": round(occ_ratio * 100),
            "bayes": round(min(demand_score * 0.7 + live_occ * 0.3, 1) * 100),
            "instance": round(demand_score * 65),
            "instanceNeighbors": 0,
            "neural": round(min(live_occ * 65 + demand_score * 35, 100)),
            "environment": round(env_score * 100),
            "routeAccess": round(route_score * 100)
        },
        "engine": "python-fallback"
    }


def get_default_environment():
    return {
        "precipitationProb": 0.0,
        "thunderstormProb": 0.0,
        "visibilityKm": 16.0,
        "cloudCover": 0.0,
        "windSpeed": 0.0,
        "aqi": 0,
        "pollenScore": 0.0
    }


def get_default_route():
    return {
        "distanceMeters": 0.0,
        "durationSeconds": 0.0,
        "roadMatched": False
    }


def extract_environment(signals):
    """Extract environment data from signal results with safe access."""
    env = get_default_environment()
    for sig in signals:
        if not isinstance(sig, dict):
            continue
        if sig.get("status") != "ready" or not sig.get("data"):
            continue
        data = sig["data"]
        if not isinstance(data, dict):
            continue
        try:
            if sig["name"] == "Weather API":
                pp = data.get("precipitation", {})
                if isinstance(pp, dict):
                    env["precipitationProb"] = float(
                        safe_get_nested(pp, "probability", "percent", default=0)
                    ) / 100
                env["thunderstormProb"] = float(data.get("thunderstormProbability", 0)) / 100
                v = data.get("visibility", {})
                if isinstance(v, dict):
                    env["visibilityKm"] = float(
                        safe_get_nested(v, "distance", "value", default=16)
                    )
                env["cloudCover"] = float(data.get("cloudCover", 0)) / 100
                w = data.get("wind", {})
                if isinstance(w, dict):
                    env["windSpeed"] = float(safe_get_nested(w, "speed", "value", default=0))
            elif sig["name"] == "Air Quality API":
                indexes = data.get("indexes", [])
                if isinstance(indexes, list) and len(indexes) > 0 and isinstance(indexes[0], dict):
                    env["aqi"] = int(indexes[0].get("aqi", 0))
            elif sig["name"] == "Pollen API":
                daily = data.get("dailyInfo", [])
                if isinstance(daily, list) and len(daily) > 0 and isinstance(daily[0], dict):
                    pollen_types = daily[0].get("pollenTypeInfo", [])
                    if isinstance(pollen_types, list):
                        scores = [
                            float(p.get("indexInfo", {}).get("value", 0))
                            for p in pollen_types
                            if isinstance(p, dict) and isinstance(p.get("indexInfo"), dict)
                            and p["indexInfo"].get("value", 0) > 0
                        ]
                        if scores:
                            env["pollenScore"] = max(scores)
        except (TypeError, ValueError, AttributeError) as e:
            logger.warning(f"Field extraction error in {sig.get('name')}: {sanitize_log(str(e))}")
            continue
    return env


def extract_route(signals):
    """Extract route data from signal results with safe access."""
    route = get_default_route()
    for sig in signals:
        if not isinstance(sig, dict):
            continue
        if sig.get("status") != "ready" or not sig.get("data"):
            continue
        data = sig["data"]
        if not isinstance(data, dict):
            continue
        try:
            if sig["name"] == "Distance Matrix API":
                rows = data.get("rows", [])
                if isinstance(rows, list) and len(rows) > 0:
                    elements = rows[0].get("elements", [])
                    if isinstance(elements, list) and len(elements) > 0:
                        e = elements[0]
                        if not isinstance(e, dict):
                            continue
                        # Check distance matrix status
                        if e.get("status") == "NOT_FOUND":
                            continue
                        dist = safe_get_nested(e, "distance", "value")
                        if dist:
                            route["distanceMeters"] = float(dist)
                        dur = safe_get_nested(
                            e, "duration_in_traffic", default=None
                        ) or safe_get_nested(e, "duration", "value")
                        if dur:
                            route["durationSeconds"] = float(dur)
            elif sig["name"] == "Routes API":
                routes = data.get("routes", [])
                if isinstance(routes, list) and len(routes) > 0 and isinstance(routes[0], dict):
                    r = routes[0]
                    dist = r.get("distanceMeters")
                    dur_str = r.get("duration", "0s")
                    try:
                        duration = int(dur_str.replace("s", ""))
                    except (ValueError, AttributeError):
                        duration = 0
                    if dist:
                        route["distanceMeters"] = float(dist)
                    if duration:
                        route["durationSeconds"] = float(duration)
            elif sig["name"] == "Roads API":
                snapped = data.get("snappedPoints", [])
                route["roadMatched"] = isinstance(snapped, list) and len(snapped) > 0
        except (TypeError, ValueError, AttributeError, IndexError) as e:
            logger.warning(f"Route extraction error in {sig.get('name')}: {sanitize_log(str(e))}")
            continue
    return route


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PYTHON_API_PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
