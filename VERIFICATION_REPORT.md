# Verification Report — Autonomous Hardening Pass

_Generated 2026-06-06. Claude (manager) executing builds/tests; DeepSeek v4-pro
workers (via `ds.py --batch`) performing parallel code review._

## Final status: ✅ all suites green

| Suite | Result | How to run |
|-------|--------|------------|
| C++ engine unit tests (doctest/ctest) | **7 / 7 pass** | `cmake -S cpp-engine -B build -DBUILD_TESTS=ON && ctest` |
| python-api offline suite | **118 / 118 pass** | `pytest --ignore=security_penetration_test.py` |
| webapp contract suite | **27 / 27 pass** | `pytest test_predictor.py` |
| pentest harness (live-server) | **72 tests collect cleanly** | `pytest security_penetration_test.py` (needs running server) |

## What was fixed this pass

### 1. webapp end-to-end contract (frontend ↔ backend)
The browser form and the backend had drifted into incompatible request/response
shapes. Introduced a shared `webapp/backend/predictor.py`:
- `PredictionInput` (Pydantic v2) accepts **both** snake_case and camelCase via
  `AliasChoices`, rejects non-finite numbers, and clamps `unavailable` to capacity.
- `PredictionOutput` matches exactly what the frontend's `renderResult()` reads,
  with `modelBreakdown` as an **array** of `{modelName, prediction, confidence}`.
- Both `app.py` (DB-free) and `app_db.py` (MySQL) import the shared module;
  `/api/lots` falls back to `SEED_LOTS` when the DB is down.
- 11 contract tests guard the shape so frontend/backend can't silently drift again.

### 2. C++ engine build (dead libcurl dependency)
- Removed the phantom `find_package(CURL REQUIRED)` gate; the engine ships a
  self-contained socket HTTP server. Removing it exposed 3 latent bugs that the
  build had never reached, all now fixed (`<atomic>`/`<cmath>` includes, forward
  decl, `safe_divide`/`safe_log`).
- Made unit tests genuinely runnable for the first time: doctest `_WITH_MAIN`,
  pinned + verified doctest download, static MinGW linking so ctest finds the exes.
- Clamp `hour`→[0,23] and `dayOfWeek`→[0,6] in `buildFeatureVector`.

### 3. CI/CD
Populated the empty workflow and added a repo-root `.github/workflows/ci.yml`
with three jobs: python-api, webapp, and cpp-engine (cmake + ctest).

### 4. python-api hardening
`ENABLE_DOCS` env gates `docs_url` **and** `openapi_url` (off by default);
`Server: smart-parking` header; `uvicorn.run(..., server_header=False)`.

### 5. pentest harness robustness
- **Rate-limit shadowing fixed:** an autouse fixture assigns each test a unique
  `X-Forwarded-For` IP (via `pen_client()`), so the 65-request burst test trips
  only its own per-IP bucket instead of poisoning every later test with 429.
- **inf/nan handling:** replaced two client-crashing `json=` parametrize cases
  with a raw-content test that sends literal `Infinity`/`NaN` tokens to exercise
  *server* robustness.

## DeepSeek review — findings and adjudication

Six workers (5 file reviews + 1 synthesis) ran via `ds.py --batch`. Findings were
each verified before acting (not applied blindly):

| Finding (source) | Verdict | Action |
|---|---|---|
| `clamp()` lets NaN/inf propagate (all comparisons false) → silent NaN scores (`review_cpp_src`, HIGH) | ✅ confirmed real | Fixed `clamp` to return `lo` for non-finite input — neutralizes the whole class at the root. Added regression tests. |
| `safe_divide`/`safe_log` don't honor their "keep finite" contract (`review_cpp_src`) | ✅ confirmed | Added `std::isfinite` guards + tests. |
| nlohmann_json builds its own test targets via FetchContent (`review_cmake`) | ✅ valid (defensive) | `set(JSON_BuildTests OFF CACHE INTERNAL "")`. |
| Engine sources recompiled once per test target (`review_cmake`) | ✅ valid | Refactored to a single `OBJECT` library linked by exe + all tests. |
| Security headers missing on CORS preflight due to middleware ordering (`review_apphardening`, MED) | ❌ **disproven** | Empirically tested: OPTIONS preflight (200, ACAO set) carries CSP, HSTS, and `Server: smart-parking`. In Starlette the last-registered middleware is *outermost*; security middleware already wraps CORS. No change. |
| `predictedAvailable` can exceed current free slots when `risk_raw < 0.5` (`review_predictor`, MED) | ✅ applied (on user confirmation) | Capped `predictedAvailable` at `total - unavailable` — the forecast may be more pessimistic than the live count, never more optimistic. Added 16 parametrized regression cases. |
| Per-test IP counter not safe under `pytest-xdist` (`review_pentest`) | ⚠️ noted | Acceptable: suite is run single-process; documented as a follow-up if xdist is ever adopted. |

## Notes
- DeepSeek is review/generation only; all builds and tests were executed by Claude.
- `.env` (DeepSeek API key) was handled as a secret — never printed or committed.
