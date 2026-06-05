# Technical Scan Report: Smart Parking AI

## 1. Project Purpose

A parking availability prediction system that combines a **C++ AI inference engine** with a **Python FastAPI backend** to collect live signals from 33 Google Maps Platform APIs and produce multi-model parking occupancy forecasts. The system serves a static frontend dashboard for user interaction.

## 2. Architecture and Components

The system runs as a single Docker container with three internal services:

| Component | Port | Language | Role |
|-----------|------|----------|------|
| C++ Engine | 5001 | C++17 | AI model inference (decision tree, Bayesian, KNN, neural network, A* search) |
| Python API | 8080 | Python 3.12+ | API gateway, Google API signal collection, fallback prediction |
| Static Frontend | served by Python | HTML/CSS/JS | User dashboard |

**Communication flow**: Frontend → Python API (port 8080) → C++ Engine (port 5001). The Python API acts as orchestrator, collecting Google API signals, building feature vectors, and forwarding to C++ for inference. If C++ is unreachable, Python runs a fallback prediction.

## 3. Tech Stack and Dependencies

**Python** (`requirements.txt`):
- `fastapi==0.115.6` with `uvicorn[standard]==0.34.0`
- `httpx==0.28.1` (async HTTP client for Google APIs and C++ engine calls)
- `pydantic==2.10.4` (request validation)
- `python-dotenv==1.0.1`
- `pytest==8.3.4` + `pytest-asyncio==0.25.0`

**C++** (`cpp-engine/CMakeLists.txt` not shown but implied):
- C++17 standard
- `nlohmann/json` for JSON parsing
- Raw POSIX sockets (no HTTP library) — custom HTTP server implementation
- No external ML libraries — all models hand-implemented

**Infrastructure**:
- Docker + Docker Compose (single container)
- No database — all state is in-memory or ephemeral

## 4. Key Modules and Their Functions

### Python API (`python-api/main.py`)
- **Security middleware**: IP blocking, rate limiting (60 req/min per IP), request body size limits (1MB), security headers (CSP, HSTS, X-Frame-Options), request ID generation for audit trail
- **`/api/predict`**: Main prediction endpoint — collects Google API signals concurrently via `asyncio.gather`, extracts environment/route features, calls C++ engine with 5-second timeout, falls back to Python-side prediction
- **`fallback_prediction()`**: Python-side ensemble using demand score, environment score, route score, and live occupancy ratio
- **`extract_environment()` / `extract_route()`**: Safely traverse nested API response dictionaries with `safe_get_nested()` helper

### Python Collectors (`python-api/collectors/`)
- **`__init__.py`**: Catalog of 33 Google APIs with metadata (name, group, mode, feature description)
- **`places.py`**: Nearby places demand scoring
- **`weather.py`**: Weather data collection
- **`environment.py`**: Air quality + pollen collection
- **`geolocation.py`**: Geocoding, timezone, elevation
- **`routing.py`**: Distance matrix, routes, roads

### C++ Engine (`cpp-engine/main.cpp`)
- **`parseRequest()`**: JSON-to-FeatureVector conversion with clamping and safe defaults
- **`buildPredictionJson()`**: Ensemble formula combining all 5 models
- **`handleClient()`**: Per-connection HTTP handler with thread pool (max 32 threads), socket timeout (10s), CORS support
- **`readFullBody()`**: Chunked body reader with 1MB limit

### C++ AI Models (`cpp-engine/src/`)
- **`decision_tree.cpp`**: Rule-based risk classification (Very high / High / Moderate / Low)
- **`bayesian_model.cpp`**: Naive Bayes likelihood for parking pressure
- **`instance_learning.cpp`**: KNN with similarity-weighted prediction
- **`neural_model.cpp`**: Sigmoid-activated weighted sum
- **`search_model.cpp`**: Haversine-based parking slot ranking (A*)
- **`feature_extractor.cpp`**: Builds feature vector from all inputs

### Frontend (`frontend/js/app.js`)
- Input validation with range checks (lat: -90..90, lng: -180..180, slots: 1..1000)
- XSS prevention via `textContent` instead of `innerHTML`
- Frame-busting for clickjacking prevention
- 15-second API timeout with abort controller
- Safe defaults for all display fields

## 5. Notable Strengths

1. **Security-first design**: The Python API has comprehensive middleware — IP blocking, rate limiting, request size limits, security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options), request ID tracking, and audit logging. The Docker Compose file drops all capabilities, uses read-only root filesystem, and sets resource limits.

2. **Defensive programming throughout**: Every data extraction uses safe defaults, clamping, and null checks. The C++ engine clamps all input values to valid ranges. The frontend validates all inputs before submission and uses `textContent` to prevent XSS.

3. **Graceful degradation**: If the C++ engine is unreachable or times out, the Python API falls back to a Python-side prediction. If Google API calls fail, the system uses default values for environment/route features.

4. **Concurrent signal collection**: Uses `asyncio.gather` to collect all 10 live Google APIs concurrently, minimizing latency.

5. **Thread safety in C++**: Atomic counter for active threads, max 32 concurrent clients, socket timeouts to prevent hung connections.

## 6. Risks, Gaps, and TODOs

### Critical Issues

1. **No test files found**: Zero test files in the entire project. No unit tests for C++ models, no integration tests for Python API, no end-to-end tests. The `requirements.txt` includes `pytest` and `pytest-asyncio` but they are unused.

2. **No database/persistence**: All state is in-memory. Historical data is passed in request bodies but never stored. No caching of Google API responses — every prediction re-fetches all APIs. This makes the system stateless but also means no learning from past predictions.

3. **C++ HTTP server is hand-rolled**: Raw POSIX sockets with manual HTTP parsing. No TLS, no HTTP/2, no request routing library. The `readFullBody()` function has fragile content-length parsing that could break with chunked transfer encoding or unusual header formatting.

4. **Rate limiter is per-process, in-memory**: Restarting the container resets all rate limits. No distributed rate limiting for multi-instance deployments. The sliding window implementation uses a list that grows unboundedly for active IPs.

### Moderate Issues

5. **Google API key exposed in logs**: The `redact_api_key()` function exists but is never called in the audit logging path. API keys could appear in log files if a URL with an embedded key is logged.

6. **No input sanitization in C++ engine**: The C++ engine accepts arbitrary JSON and only validates structure, not content. A malicious payload with deeply nested JSON could cause stack overflow or memory issues.

7. **Static frontend served without CSRF protection**: The frontend makes POST requests without CSRF tokens. While CORS is restricted, there's no SameSite cookie configuration or CSRF validation.

8. **No health check for Google API quota**: The system doesn't track Google API quota usage. A single user could exhaust daily quotas by making many predictions.

### Minor Issues

9. **Hardcoded fallback values**: `get_default_environment()` and `get_default_route()` return hardcoded values (visibility 16km, AQI 0, etc.) that may not be realistic for all locations.

10. **No model versioning**: The C++ engine reports version "v1.0.0" but there's no mechanism to update models without rebuilding the container.

11. **Frontend lacks loading states for individual components**: The spinner only covers the predict button, not the results cards.

## 7. Test Coverage Observed

**Test coverage: 0%**

- No test files exist anywhere in the project tree
- No `tests/` directory in any component
- No test configuration (no `pytest.ini`, no `CMakeLists.txt` test targets)
- The `requirements.txt` includes `pytest==8.3.4` and `pytest-asyncio==0.25.0` but they are not used
- No CI/CD configuration (no GitHub Actions, no Jenkinsfile)
- No test fixtures or mock data files

**Recommendation**: At minimum, add:
- Unit tests for each C++ model (decision tree, Bayesian, KNN, neural network)
- Integration tests for Python API endpoints (health, predict, collect-signals)
- Mock tests for Google API collectors (to avoid live API calls in CI)
- End-to-end test with Docker Compose