# Parking Availability AI

This folder contains the standalone AI model used by the website. The UI imports only `parking-availability-ai.js`; the internal model is split into separate syllabus-oriented modules.

## Files

- `parking-availability-ai.js`: public entry point used by the website.
- `google-signals.js`: Google Maps Platform signal collector and 33-API catalog.
- `feature-extractor.js`: converts app data and API responses into numeric model features.
- `search-model.js`: slot recommendation using heuristic search-style scoring.
- `decision-tree-model.js`: explainable risk classification.
- `bayesian-model.js`: probability-style pressure estimate from evidence.
- `instance-learning-model.js`: K-nearest-neighbor style historical comparison.
- `neural-score-model.js`: single-layer sigmoid neural-style score.
- `responsible-ai.js`: confidence, source transparency, and safeguards.
- `ai-utils.js`: shared math and time helpers.

## Inputs

- Live parking-slot status from the app data store.
- Parking history logs from the app data store.
- Nearby place/shop demand from Places API (New).
- Weather, air quality, pollen, route/access, road, elevation, geocoding, and time-zone signals when available.
- Local fallback time/day features when API signals are unavailable.

## Google API Handling

The model represents all 33 enabled APIs in `GOOGLE_MAPS_API_CATALOG`.

Some services are active prediction inputs, such as Places, Weather, Air Quality, Pollen, Routes, Distance Matrix, Roads, Elevation, Geocoding, and Time Zone. Others are SDK, visualization, management, or future-extension services, so they are documented as context signals instead of being forced into every prediction call.

This keeps the project honest: the AI uses every enabled API as part of the design and explanation, while only fetching APIs that can provide useful browser-side prediction evidence.

## Syllabus Concepts Used

- Unit 1: intelligent agent, rational decision-making, acting humanly, thinking rationally.
- Unit 2: search/problem solving through slot ranking and route/access cost.
- Unit 3: decision tree, Bayesian learning, instance-based learning, neural score.
- Unit 5: responsible AI through confidence, source labels, fallback behavior, and explicit limitations.

## Public API

```js
import {
  buildParkingAvailabilityPrediction,
  fetchNearbyPlacesDemand,
  fetchParkingContextSignals,
  GOOGLE_MAPS_API_CATALOG
} from "./ai/parking-availability-ai.js";
```

`buildParkingAvailabilityPrediction(area, slots, logs, options)` returns predicted availability, risk, confidence, model breakdown, API explanation, and suggested slots.

`fetchNearbyPlacesDemand(area, options)` is kept for compatibility with the website, but now returns the broader Google Maps Platform signal object.
