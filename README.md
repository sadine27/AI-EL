# Smart Parking AI

AI-driven smart parking availability prediction. The system predicts near-future
parking availability around an area by combining live parking state, historical
behavior, nearby-place activity, route/access conditions, and environmental
signals from Google Maps Platform APIs.

> **Note:** This repository was restructured. The current, actively developed
> project lives at the repository root. The original browser-only prototype has
> been moved to [`archive/`](./archive) for reference — see
> [`archive/README.md`](./archive/README.md).

## Project Layout

```
.
├── smart-parking-cpp/   # Primary engine: C++ AI models + Python FastAPI backend + static frontend (Dockerized)
├── webapp/              # Full-stack web app (backend / db / frontend)
├── docs/                # Project documentation (PROJECT_REPORT.md, CODEBASE_SCAN.md)
├── ONBOARDING.md        # Start here — plain-English onboarding guide
└── archive/             # Original browser-only prototype (legacy, not maintained)
```

## Components

### `smart-parking-cpp/` — AI prediction engine
A C++ AI engine (decision tree, Bayesian, KNN, neural network, A* search) with a
Python FastAPI backend that collects live signals from Google Maps Platform APIs,
served alongside a static frontend. Runs via Docker.
See [`smart-parking-cpp/README.md`](./smart-parking-cpp/README.md).

### `webapp/` — full-stack web application
Web application with `backend/`, `db/`, and `frontend/` tiers.

## Getting Started

New to the project? Read **[ONBOARDING.md](./ONBOARDING.md)** first, then the
component READMEs above.

```bash
# Run the AI engine (recommended path)
cd smart-parking-cpp
docker compose up --build
```

## Documentation

- [`ONBOARDING.md`](./ONBOARDING.md) — onboarding guide
- [`docs/PROJECT_REPORT.md`](./docs/PROJECT_REPORT.md) — project report
- [`docs/CODEBASE_SCAN.md`](./docs/CODEBASE_SCAN.md) — codebase scan
