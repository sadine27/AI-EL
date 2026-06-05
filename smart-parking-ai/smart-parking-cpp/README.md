# Smart Parking AI — Enhanced C++ + Python Engine

A parking availability prediction system using **C++ AI engine** (decision tree, Bayesian, KNN, neural network) with a **Python FastAPI** backend that collects live signals from 33 Google Maps Platform APIs.

## Architecture

```
┌──────────────────────────────────────────────┐
│                 Docker Container               │
│                                                │
│  ┌──────────────┐     ┌───────────────────┐   │
│  │  C++ Engine    │◄────│  Python FastAPI    │  │
│  │  (port 5001)   │     │  (port 8080)       │  │
│  │                │     │                    │  │
│  │ · Decision Tree│     │ · Places (New)     │  │
│  │ · Bayesian     │     │ · Weather          │  │
│  │ · KNN          │     │ · Air Quality      │  │
│  │ · Neural       │     │ · Pollen           │  │
│  │ · A* Search    │     │ · Geocoding        │  │
│  │ · Feature Ext  │     │ · Time Zone        │  │
│  └───────┬────────┘     │ · Elevation        │  │
│          │              │ · Roads            │  │
│          │              │ · Routes           │  │
│          │              │ · Distance Matrix  │  │
│          │              └────────┬───────────┘  │
│          │                       │              │
│          └─────────┬─────────────┘              │
│                    │                            │
│           ┌────────▼────────┐                  │
│           │  Static Frontend │                  │
│           │  (HTML/CSS/JS)   │                  │
│           └─────────────────┘                  │
└────────────────────────────────────────────────┘
```

## AI Models

| Model | File | Description |
|-------|------|-------------|
| Decision Tree | `cpp-engine/src/decision_tree.cpp` | Rule-based risk classification (Very high / High / Moderate / Low) |
| Bayesian | `cpp-engine/src/bayesian_model.cpp` | Probabilistic parking pressure using Naive Bayes likelihood |
| KNN (Instance-based) | `cpp-engine/src/instance_learning.cpp` | Similarity-weighted prediction from historical data |
| Neural Network | `cpp-engine/src/neural_model.cpp` | Sigmoid-activated weighted sum of all features |
| A* Search | `cpp-engine/src/search_model.cpp` | Haversine-based parking slot ranking |

## Google API Signals

The Python backend collects from **10 live APIs** concurrently:
- **Places API (New)** — Nearby shop demand
- **Weather API** — Rain, visibility, wind
- **Air Quality API** — AQI and pollution
- **Pollen API** — Pollen discomfort score
- **Time Zone API** — Local hour correction
- **Geocoding API** — Location context
- **Maps Elevation API** — Slope accessibility
- **Roads API** — Nearest road check
- **Distance Matrix API** — Travel distance/time
- **Routes API** — Route duration/distance

Plus 23 additional APIs tracked as planned/context signals (total: 33 Google Maps Platform APIs).

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Google Maps API key with required APIs enabled

### Run with Docker

```bash
# Clone and setup
cd smart-parking-cpp

# Set your API key
export GOOGLE_MAPS_API_KEY="your-api-key"

# Build and run
docker compose up --build
```

Then open `http://localhost:8080` in your browser.

### Run without Docker (development)

```bash
# Python API + fallback (no C++ engine)
cd python-api
pip install -r ../requirements.txt
python main.py

# Frontend: open directly or serve via Python
# FastAPI serves the frontend at http://localhost:8080
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Engine status and version |
| `/api/signals` | GET | List of all 33 Google APIs |
| `/api/collect-signals` | POST | Collect live Google API signals |
| `/api/predict` | POST | Full prediction pipeline |

### Prediction Request

```json
{
  "lat": 19.0760,
  "lng": 72.8777,
  "totalSlots": 10,
  "unavailable": 3
}
```

### Prediction Response

```json
{
  "predictedAvailable": 7,
  "predictedOccupancyPct": 30,
  "riskLabel": "Low",
  "demandLabel": "Moderate",
  "confidencePct": 72,
  "modelBreakdown": {
    "decisionTree": "Low",
    "decisionTreeScore": 24,
    "bayes": 38,
    "instance": 42,
    "instanceNeighbors": 5,
    "neural": 35,
    "environment": 12,
    "routeAccess": 8
  },
  "engine": "cpp"
}
```

## File Structure

```
smart-parking-cpp/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env.example
├── README.md
├── cpp-engine/
│   ├── CMakeLists.txt
│   ├── main.cpp                  # HTTP server on port 5001
│   ├── include/
│   │   ├── ai_utils.h            # Structs, constants, utilities
│   │   ├── feature_extractor.h   # Feature vector builder
│   │   ├── decision_tree.h
│   │   ├── bayesian_model.h
│   │   ├── instance_learning.h
│   │   ├── neural_model.h
│   │   └── search_model.h
│   └── src/
│       ├── ai_utils.cpp
│       ├── feature_extractor.cpp
│       ├── decision_tree.cpp
│       ├── bayesian_model.cpp
│       ├── instance_learning.cpp
│       ├── neural_model.cpp
│       └── search_model.cpp
├── python-api/
│   ├── main.py                   # FastAPI: port 8080
│   ├── collectors/
│   │   ├── __init__.py           # 33 API catalog
│   │   ├── places.py
│   │   ├── weather.py
│   │   ├── environment.py
│   │   ├── geolocation.py
│   │   └── routing.py
│   └── models/
│       ├── features.py
│       └── prediction.py
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/app.js
└── scripts/
    └── setup.sh
```

## Requirements

- C++17 (GCC 14+)
- Python 3.12+
- CMake 3.20+
- Docker 24+ (for containerized deployment)
- Google Maps Platform API key (for live signals)
