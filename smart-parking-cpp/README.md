# Smart Parking AI

Predicts how easy it is to **park near any location**. You pick a spot (your
current location or an address), and the app uses an explainable AI engine plus
live Google Maps Platform signals to estimate:

- the **probability that nearby parking is occupied**,
- **how many spots are likely free** (estimated from nearby parking capacity), and
- a plain-English **AI opinion** explaining *why* and *what to do* (including the
  best time to arrive).

You never enter slot counts — the app discovers nearby parking and predicts
occupancy itself.

## How it works

```
  Your location (GPS or address search)
        │
        ▼
  Python FastAPI backend  ──►  collects live signals from Google Maps Platform
        │                       (places, parking, weather, air, routes, …)
        ▼
  AI engine (pure Python)  ──►  decision tree · naive Bayes · KNN · neural net
        │                       · A* search · ensemble
        ▼
  Result: occupancy probability, estimated free spots, per-lot breakdown,
          explainable AI opinion + best arrival time
        │
        ▼
  Web dashboard (map + gauge + opinion)
```

The **Python AI engine is canonical** — the app always returns a real,
explainable result with no build step. A standalone **C++ engine** (same
concepts) lives in `cpp-engine/` as an optional component for reference; it is
not required to run the app.

## AI concepts (in `python-api/ai/`)

| Concept | File | Role |
|--------|------|------|
| Decision Tree | `ai/decision_tree.py` | Rule-based occupancy risk + readable decision path |
| Naive Bayes | `ai/bayesian.py` | Posterior probability of a "busy" state |
| KNN (instance-based) | `ai/knn.py` | Distance-weighted vote over prototype scenarios |
| Neural network | `ai/neural.py` | Small fixed-weight MLP for non-linear interactions |
| A* search | `ai/search.py` | Searches future arrival slots for the best time to go |
| Ensemble + capacity | `ai/engine.py` | Combines models, estimates capacity & free spots |
| Explainable opinion | `ai/opinion.py` | Turns numbers into a human recommendation |

## Quick start

### Option 1 — one-click launcher (recommended)

```bash
# macOS / Linux
./start.sh

# Windows: double-click start.bat
```

This creates a local Python environment, starts the app, and opens
`http://localhost:8080` in your browser. It runs **without** an API key using
density-based estimates; add a key for live data (below).

### Option 2 — Docker

```bash
export GOOGLE_MAPS_API_KEY="your-api-key"   # optional
docker compose up --build
# open http://localhost:8080
```

### Live data (optional)

Copy `.env.example` to `.env` and set `GOOGLE_MAPS_API_KEY`. Without a key the
app still works using estimates; with a key it pulls live signals and real
nearby-parking locations. Address search works without a key too (it falls back
to OpenStreetMap).

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Engine status and whether a key is configured |
| `/api/geocode?address=` | GET | Resolve an address to coordinates (Google → OSM fallback) |
| `/api/signals` | GET | Catalog of the 33 Google Maps Platform APIs |
| `/api/predict` | POST | Location-only prediction (see below) |

### Prediction request

```json
{ "lat": 19.0760, "lng": 72.8777, "address": "optional label" }
```

### Prediction response (abridged)

```json
{
  "occupancyProbabilityPct": 63,
  "estimatedCapacity": 350,
  "estimatedAvailable": 130,
  "verdict": "Moderate",
  "riskLabel": "High",
  "demandLabel": "Heavy",
  "confidencePct": 71,
  "parkingLots": [{ "name": "City Garage", "estStalls": 280, "estAvailable": 109, "occupancyPct": 61 }],
  "modelBreakdown": { "decisionTree": "Very high", "bayes": 68, "knn": 60, "neural": 35, "supplyTightness": 31 },
  "bestArrival": { "bestHour": 21, "bestOccupancy": 0.53, "improvesIfWait": true },
  "aiOpinion": { "verdict": "Moderate", "headline": "…", "reasons": ["…"], "recommendation": "…" },
  "engine": "python-ai"
}
```

## Project structure

```
smart-parking-cpp/
├── start.sh / start.bat        # one-click launchers
├── Dockerfile / docker-compose.yml
├── requirements.txt
├── python-api/
│   ├── main.py                 # FastAPI app (serves frontend + API)
│   ├── ai/                     # canonical AI engine (this is the brain)
│   │   ├── decision_tree.py  bayesian.py  knn.py  neural.py
│   │   ├── search.py  engine.py  opinion.py
│   ├── collectors/             # Google API collectors + scoring
│   └── models/                 # legacy fallback helpers (not on the main path)
├── frontend/                   # map + dashboard (HTML/CSS/JS, Leaflet)
└── cpp-engine/                 # optional standalone C++ engine (reference)
```

## Tests

```bash
cd python-api
SERVE_FRONTEND=0 python -m pytest tests/ -q
```

## Requirements

- Python 3.11+
- (optional) Docker 24+ for containerised deployment
- (optional) Google Maps Platform API key for live signals
- (optional) C++17 + CMake to build the reference `cpp-engine/`
