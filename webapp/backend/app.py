"""
Smart Parking Predictor — standalone webapp backend (DB-free).

Two ways to get parking data:
  - /api/nearby : queries OpenStreetMap (Overpass) for REAL parking lots around the
                  caller's GPS location, and attaches an AI availability ESTIMATE to
                  each (there is no free live-occupancy feed, so we estimate it).
  - /api/predict: the original single-lot prediction contract (kept for tests/compat).

For the MySQL-backed variant run app_db.py instead — both expose the same API.
"""

import json
import math
import os
import urllib.parse
import urllib.request
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from predictor import (
    PredictionInput,
    PredictionOutput,
    SEED_LOTS,
    estimate_lot_availability,
    predict,
)

app = FastAPI(title="Smart Parking Predictor", version="1.0.0")

# Explicit origins; no credentials since this API uses no cookies/auth.
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:8000,http://127.0.0.1:3000,http://127.0.0.1:8000",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

# Overpass mirrors, tried in order. The primary instance is often overloaded, so
# we fall through to community mirrors before failing. OVERPASS_URL pins one.
OVERPASS_ENDPOINTS = (
    [os.environ["OVERPASS_URL"]]
    if os.getenv("OVERPASS_URL")
    else [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ]
)


# ------------------------------------------------------------
# Helpers for the real-world nearby lookup
# ------------------------------------------------------------
def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.asin(math.sqrt(a))


def _estimate_capacity(tags: dict) -> int:
    """When OSM doesn't record a capacity, guess from the parking type."""
    kind = (tags.get("parking") or "").lower()
    if kind in ("multi-storey", "underground"):
        return 300
    if kind == "surface":
        return 80
    return 60


def _name_for(tags: dict) -> str:
    if tags.get("name"):
        return tags["name"]
    operator = tags.get("operator")
    kind = (tags.get("parking") or "parking").replace("_", " ").replace("-", " ")
    if operator:
        return f"{operator} parking"
    return f"{kind.title()} parking"


def _fetch_parking(lat: float, lng: float, radius: int) -> list:
    """Query Overpass for parking nodes/ways around a point.

    The main public Overpass instance is frequently overloaded (504/429/timeouts),
    so we try a list of mirrors in turn and only give up if ALL of them fail. Set
    OVERPASS_URL to force a single endpoint.
    """
    query = (
        "[out:json][timeout:25];"
        "("
        f'node["amenity"="parking"](around:{radius},{lat},{lng});'
        f'way["amenity"="parking"](around:{radius},{lat},{lng});'
        ");"
        "out center tags;"
    )
    data = urllib.parse.urlencode({"data": query}).encode()

    last_error = None
    for endpoint in OVERPASS_ENDPOINTS:
        req = urllib.request.Request(
            endpoint,
            data=data,
            headers={"User-Agent": "SmartParkingAI/1.0 (educational project)"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            return payload.get("elements", [])
        except Exception as exc:  # try the next mirror on any failure
            last_error = f"{endpoint.split('/')[2]}: {exc}"
            continue

    raise RuntimeError(f"all Overpass mirrors failed (last: {last_error})")


# ------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"status": "healthy", "version": "1.0.0"}


@app.get("/api/lots")
def get_lots():
    """Return the seed parking lots (legacy; no database required)."""
    return SEED_LOTS


@app.get("/api/nearby")
def nearby(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: int = Query(1500, ge=100, le=5000, description="search radius in metres"),
    hour: int | None = Query(None, ge=0, le=23),
    dayOfWeek: int | None = Query(None, ge=0, le=6, description="0=Mon .. 6=Sun"),
):
    """Real parking lots near (lat,lng) from OpenStreetMap, each with an AI
    availability estimate for the given (or current) hour and weekday."""
    now = datetime.now()
    hour = now.hour if hour is None else hour
    dow = now.weekday() if dayOfWeek is None else dayOfWeek  # Mon=0 .. Sun=6

    try:
        elements = _fetch_parking(lat, lng, radius)
    except Exception as exc:  # network / Overpass outage
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach OpenStreetMap parking data: {exc}",
        )

    lots = []
    for el in elements:
        if el.get("type") == "node":
            la, ln = el.get("lat"), el.get("lon")
        else:
            center = el.get("center") or {}
            la, ln = center.get("lat"), center.get("lon")
        if la is None or ln is None:
            continue

        tags = el.get("tags", {})
        try:
            capacity = int(tags.get("capacity"))
        except (TypeError, ValueError):
            capacity = _estimate_capacity(tags)

        seed = f"{el.get('type')}/{el.get('id')}"
        est = estimate_lot_availability(capacity, hour, dow, seed)
        lots.append({
            "id": seed,
            "name": _name_for(tags),
            "lat": la,
            "lng": ln,
            "distanceKm": round(_haversine_km(lat, lng, la, ln), 2),
            "fee": tags.get("fee"),
            "access": tags.get("access"),
            "capacityEstimated": "capacity" not in tags,
            **est,
        })

    lots.sort(key=lambda x: x["distanceKm"])
    return {
        "count": len(lots),
        "hour": hour,
        "dayOfWeek": dow,
        "center": {"lat": lat, "lng": lng},
        "lots": lots[:40],
    }


@app.post("/api/predict", response_model=PredictionOutput)
def predict_endpoint(data: PredictionInput):
    return predict(data)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
