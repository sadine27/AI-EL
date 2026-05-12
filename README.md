# Smart Parking Availability Prediction using Explainable AI

This project is an AI Foundations for Engineers course project. It builds a browser-based smart parking system and a separate explainable AI model that predicts near-future parking availability around an area by combining live parking state, historical parking logs, nearby-place activity, route/access conditions, and environmental signals from Google Maps Platform APIs.

The main project idea is:

```text
Can an AI agent estimate parking availability near a selected area by observing nearby shops, road access, weather, time, and previous parking behavior?
```

The implementation is intentionally designed around the syllabus concepts from:

- Unit 1: Foundations of AI, rational agents, intelligent agents, responsible AI
- Unit 2: Problem solving by searching, BFS/DFS/A* style search, route-finding problems
- Unit 3: Machine learning, decision tree learning, Bayesian learning, instance-based learning
- Unit 5: Responsible AI lifecycle, human-centered design, data processing, prototyping, testing, deployment, monitoring

## Current Status

The web application currently includes:

- Direct open workspace with no login or role picker
- Local workspace parking-area management
- Parking-area registration
- Real map-based parking-area pin placement
- Automatic parking-area rectangle generation from center, length, and width
- Nearby OpenStreetMap footprint snapping for map-accurate shapes
- Manual boundary-point pinning with enclosed area calculation
- Slot creation with row and column labels such as `A1`, `B2`
- Real map-based slot-center pinning
- Automatic rectangular slot-grid generation
- Driving aisle gap between slot rows
- Search-based parking-area lookup
- Nearby parking-area discovery using browser geolocation or local demo location
- Prediction-only availability dashboard
- Parking history
- Parking logs
- Manual slot override
- Simulated sensor updates
- AI parking-availability prediction using a separate AI module

## Project Structure

```text
.
├── assets/images/                 # Syllabus/reference images
├── css/                           # Application styles
├── docs/                          # LaTeX source and compiled report
├── js/                            # Browser application and AI modules
├── scripts/                       # Local development server scripts
├── .env.example                   # Local secret template
├── runtime-config.example.json    # Browser runtime config template
├── Caddyfile                      # Optional local Caddy HTTPS config
└── index.html                     # Static app entry point
```

The AI model is separated from the UI in:

```text
js/ai/parking-availability-ai.js
```

The website imports the AI model from:

```js
import {
  buildParkingAvailabilityPrediction,
  fetchNearbyPlacesDemand
} from "./ai/parking-availability-ai.js";
```

## Problem Statement

Urban drivers often waste time searching for available parking near commercial areas, colleges, hospitals, malls, restaurants, and transport-heavy locations. Parking availability changes dynamically because of:

- Current slot occupancy
- Nearby shops and institutions becoming busy
- Peak hours
- Weather conditions
- Road access difficulty
- Walking distance from slot to destination
- Historical parking behavior
- Local events or crowd-like behavior inferred from nearby places

The project aims to build an AI-assisted smart parking predictor that estimates how many parking slots are likely to remain available in the next short time horizon, such as 30 minutes.

## Objectives

The objectives are:

- Build a working smart parking web application.
- Separate the AI model into importable files.
- Use Google Maps Platform APIs as data sources.
- Convert API responses into useful AI features.
- Implement explainable AI concepts from the syllabus.
- Predict near-future parking availability.
- Recommend suitable parking slots.
- Show confidence and explanation for every prediction.
- Keep the system demo-ready even when APIs are unavailable by using fallback local features.

## Key Research Question

```text
How accurately and explainably can a parking availability AI agent predict short-term slot availability using nearby place demand, time, weather, route context, and parking history?
```

## Google Maps Platform APIs Available

The project key has the following APIs enabled:

1. Address Validation API
2. Aerial View API
3. Air Quality API
4. Directions API
5. Distance Matrix API
6. Geocoding API
7. Geolocation API
8. Map Management API
9. Map Tiles API
10. Maps 3D SDK for Android
11. Maps 3D SDK for iOS
12. Maps Platform Datasets API
13. Maps Elevation API
14. Maps Embed API
15. Maps Grounding Lite API
16. Maps JavaScript API
17. Maps SDK for Android
18. Maps SDK for iOS
19. Maps Static API
20. Navigation SDK
21. Places Aggregate API
22. Places API
23. Places API (New)
24. Places UI Kit
25. Pollen API
26. Roads API
27. Route Optimization API
28. Routes API
29. Solar API
30. Street View Publish API
31. Street View Static API
32. Time Zone API
33. Weather API

## API Usage Strategy

The AI should not call all 33 APIs every time. A strong AI system uses relevant features and avoids unnecessary quota use. The project design treats the APIs as optional signal sources. Each API contributes only if its signal improves parking prediction, route recommendation, explanation, or report/demo quality.

### Direct AI Feature APIs

These APIs provide features that can directly affect the prediction:

| API | AI Feature Extracted | Why It Matters |
| --- | --- | --- |
| Places API (New) | Nearby shops, types, ratings, review counts, opening hours | Estimates commercial crowd demand |
| Places API | Compatibility for place search and details | Supports fallback place lookup |
| Places Aggregate API | Area-level place insights when available | Helps estimate crowd density around parking area |
| Weather API | Rain, temperature, visibility, weather condition | Weather affects parking duration and walking behavior |
| Air Quality API | Air quality index and pollution category | Poor air quality can reduce walking distance tolerance |
| Pollen API | Pollen level | Minor health/environment comfort feature |
| Geocoding API | Address to latitude/longitude | Converts user search into model location input |
| Geolocation API | Approximate user/device location | Finds nearby parking areas when GPS is unavailable |
| Time Zone API | Local time for prediction area | Ensures correct peak-hour and day features |
| Distance Matrix API | Travel time/distance from user to parking area | Used in search cost and ranking |
| Directions API | Route path and estimated travel effort | Helps estimate route difficulty |
| Routes API | Modern route duration and route alternatives | Used for A* style recommendation |
| Roads API | Road snapping and road-access context | Helps estimate accessibility of parking entrances |
| Maps Elevation API | Slope/access difficulty | Minor walking and accessibility feature |
| Route Optimization API | Best order among multiple candidate parking areas | Useful when comparing several parking choices |

### Visualization and Presentation APIs

These APIs are useful for UI, reports, PPTs, or demonstration, but they are not core prediction features:

| API | Use in Project |
| --- | --- |
| Maps JavaScript API | Interactive map rendering if replacing Leaflet or adding Google basemap |
| Map Tiles API | Custom map tile rendering |
| Maps Static API | Static images for reports/PPT |
| Street View Static API | Street-level context image for report/demo |
| Aerial View API | Aerial visualization for parking area presentation |
| Maps Embed API | Embedded map view in report/demo web page |
| Places UI Kit | UI components for place search |
| Map Management API | Managing map styles and configurations |
| Maps Platform Datasets API | Uploading/using custom datasets for parking areas |
| Maps Grounding Lite API | Grounding textual place/location answers |
| Solar API | Optional environmental/context feature, not central to parking |
| Street View Publish API | Publishing imagery, not required for prediction |
| Maps SDK for Android | Mobile app future extension |
| Maps SDK for iOS | Mobile app future extension |
| Maps 3D SDK for Android | Future 3D mobile visualization |
| Maps 3D SDK for iOS | Future 3D mobile visualization |
| Navigation SDK | Future turn-by-turn navigation integration |

## Important API Limitation

Google Maps public APIs do not expose the exact Google Maps "Popular times" chart as a normal public field. Therefore, the AI model must infer nearby demand using available signals:

- Number of nearby places
- Place type
- Opening hours
- Current open status
- Rating
- Review count
- Distance from parking area
- Time of day
- Day of week
- Weather
- Historical parking logs
- Current slot occupancy

This is suitable for the course because the project is not just displaying API data. It is building an AI prediction model from features.

## AI System Architecture

```text
User Interface
  |
  v
Parking Area and Slot Data
  |
  v
AI Feature Extraction Layer
  |
  +-- Live slot occupancy
  +-- Parking history logs
  +-- Nearby place demand
  +-- Weather and environment
  +-- Route and distance cost
  +-- Time and calendar context
  |
  v
Explainable AI Model Layer
  |
  +-- Search model
  +-- Decision tree model
  +-- Bayesian pressure model
  +-- Instance-based learning model
  +-- Neural-style weighted score
  |
  v
Responsible AI Explanation Layer
  |
  v
Prediction Output
```

## AI Inputs

The model can use the following inputs:

| Input | Source | Type |
| --- | --- | --- |
| Current slot status | App data store or sensors | Live internal data |
| Parking logs | App data store | Historical internal data |
| Parking area coordinates | Admin map setup | Internal geospatial data |
| User location | Browser geolocation or Geolocation API | External/local location data |
| Nearby shops | Places API | External API data |
| Opening hours | Places API (New) | External API data |
| Place ratings/reviews | Places API (New) | External API data |
| Weather | Weather API | External API data |
| Air quality | Air Quality API | External API data |
| Pollen level | Pollen API | External API data |
| Travel time | Distance Matrix / Routes API | External API data |
| Road access | Roads API | External API data |
| Elevation | Elevation API | External API data |
| Local time | Time Zone API | External API data |

## AI Outputs

The model returns:

- Predicted number of available slots
- Predicted occupancy percentage
- Demand label: Light, Moderate, Heavy
- Risk label: Low, Moderate, High, Very high
- Confidence percentage
- Recommended slots
- Top demand-causing nearby places
- Model breakdown
- Source labels
- Responsible AI explanation

Example output:

```json
{
  "horizonMinutes": 30,
  "liveAvailable": 9,
  "predictedAvailable": 5,
  "predictedOccupancyPct": 72,
  "riskLabel": "High",
  "confidencePct": 78,
  "demandLabel": "Heavy",
  "modelBreakdown": {
    "decisionTree": "High",
    "bayes": 71,
    "neural": 74
  }
}
```

## Unit 1: Foundations of AI Mapping

### What is AI?

In this project, AI is used to make a useful decision under uncertainty. The system observes the environment and predicts near-future parking availability.

### Acting Humanly

The system behaves like a human parking assistant:

- It observes nearby places.
- It checks whether the area is likely busy.
- It considers time and weather.
- It recommends a parking slot.
- It explains the reason in simple language.

### Thinking Humanly

A human driver may reason:

```text
It is evening, the mall and restaurants are open, it is raining, and only a few slots are free. Parking may become difficult soon.
```

The AI converts the same reasoning into features and scores.

### Thinking Rationally

The AI uses formal rules and probability-like scores to estimate risk. It does not only guess. It combines:

- Current evidence
- Historical evidence
- Nearby demand evidence
- Environmental evidence

### Acting Rationally

The AI agent chooses actions that improve the driver outcome:

- Predict availability
- Recommend safer slots
- Prefer lower-cost parking choices
- Warn when demand is high
- Use fallback logic when API data is missing

### Intelligent Agent Formulation

| Agent Component | Project Meaning |
| --- | --- |
| Agent | Smart parking AI predictor |
| Environment | Parking area, roads, nearby shops, weather, users |
| Sensors | Google APIs, live slot state, logs, browser location |
| Actuators | Prediction display, area-level availability guidance, demand-risk warning |
| Performance measure | Correct predictions, reduced search time, clear explanation |

## Unit 2: Problem Solving by Searching

The parking problem can be formulated as a search problem.

| Search Component | Project Mapping |
| --- | --- |
| Initial state | User location and current parking state |
| Goal state | User gets a suitable parking slot |
| Actions | Choose area, choose slot, wait, reroute |
| Path cost | Distance, time, demand, weather, occupancy, walking effort |
| Heuristic | Estimated probability that a slot remains available |

### BFS-Style Search

Breadth-first search is represented by scanning all nearby candidate parking areas around the user before choosing one.

### DFS-Style Search

Depth-first search is represented by going deep into one selected parking area and checking its individual slots and recommendations.

### A-Star Style Heuristic Search

The recommended parking area or slot can be ranked using a heuristic:

```text
parkingCost =
  distanceCost
+ travelTimeCost
+ predictedOccupancyCost
+ nearbyDemandCost
+ weatherPenalty
+ roadAccessPenalty
- confidenceBonus
```

The area or slot with the lowest total cost is recommended.

## Unit 3: Machine Learning Mapping

The project uses an explainable ensemble instead of a single black-box model.

### Training Experience

The training experience comes from:

- Previous parking sessions
- Entry and exit logs
- Slot usage duration
- Historical occupancy at the same hour/day
- Nearby demand conditions when available

### Target Function

The target function is:

```text
f(current_state, api_features, history) -> predicted_available_slots
```

### Representation

The state is represented as numerical and categorical features:

- Live occupancy ratio
- Nearby demand score
- Historical pressure score
- Weather penalty
- Route/access cost
- Peak-hour flag
- Weekend flag
- Similar-case score

### Decision Tree Learning

Decision tree rules classify risk:

```text
IF live occupancy >= 82%
  THEN Very high demand
ELSE IF nearby demand is high AND occupancy is medium
  THEN High demand
ELSE IF historical pressure is high AND shop demand is medium
  THEN High demand
ELSE IF demand or occupancy is moderate
  THEN Moderate demand
ELSE
  THEN Low demand
```

### Bayesian Learning

The Bayesian model estimates parking pressure from evidence:

```text
P(high_pressure | peak_hour, nearby_shops_open, weather, history)
```

Evidence examples:

- Peak hour increases pressure.
- Many open shops increase pressure.
- Rain may increase duration and reduce walking distance.
- Similar historical logs increase confidence.

### Instance-Based Learning

Instance-based learning compares the current situation with past situations.

Example:

```text
Current case:
Saturday, 7 PM, restaurants nearby, rainy, 65% occupied

Similar past cases:
Saturday evening logs with high restaurant demand

Prediction:
Use the average final occupancy from similar cases
```

This is similar to K-nearest neighbors.

### Neural Network Concept

The current AI uses a simple single-layer sigmoid score:

```text
z =
  bias
+ w1 * liveOccupancyRatio
+ w2 * nearbyDemandScore
+ w3 * historicalPressure
+ w4 * weekend
+ w5 * peakHour

neuralScore = 1 / (1 + e^-z)
```

This is not a large deep learning system. It is a syllabus-friendly neural concept that shows how weighted inputs can produce a non-linear probability-like score.

## Unit 5: Responsible AI Mapping

The project follows responsible AI principles.

### Human-Centered Design

The output is designed for a driver:

- Clear predicted slot count
- Risk label
- Confidence percentage
- Recommended slots
- Short explanation

### AI Lifecycle

| Lifecycle Stage | Project Implementation |
| --- | --- |
| Data collection | Parking logs, Places API, Weather API, route data |
| Data processing | Convert raw API data into normalized features |
| Prototyping | Local JavaScript model and localStorage data |
| Testing | Demo data, simulated sensor updates, syntax checks |
| Production | Can be moved to backend or Firebase later |
| Deployment | Static web server or secure local server |
| Monitoring | Compare predicted availability with actual slot state |

### Transparency

The AI explains:

- Whether live API data was used
- Which nearby places affected demand
- Which model components contributed
- How confident the prediction is

### Privacy and Safety

Recommended practices:

- Do not publish the API key in GitHub.
- Do not expose `.env` directly from the server.
- Avoid storing precise user location history unless required.
- Use coarse location for prediction when possible.
- Move API calls to a backend proxy before production.
- Apply rate limiting and API restrictions in Google Cloud.

## Prediction Formula

The final prediction can be represented as:

```text
predictedOccupancy =
  0.35 * liveOccupancy
+ 0.20 * nearbyPlaceDemand
+ 0.15 * historicalPressure
+ 0.10 * weatherImpact
+ 0.10 * routeAccessCost
+ 0.05 * bayesianPressure
+ 0.05 * instanceBasedPressure
```

The current implementation includes live occupancy, nearby place demand, historical pressure, decision tree score, Bayesian pressure, KNN-style instance learning, neural score, weather/environment pressure, route/access pressure, and a responsible-AI explanation layer.

## Feature Engineering Plan for All Enabled APIs

| Signal Group | APIs | Feature Examples |
| --- | --- | --- |
| Location cleanup | Address Validation, Geocoding | Valid address, coordinates, location confidence |
| User position | Geolocation | User-to-parking distance |
| Nearby activity | Places API, Places API (New), Places Aggregate | Place count, open place count, type-weighted demand |
| Environment | Weather, Air Quality, Pollen | Rain penalty, visibility, AQI, pollen discomfort |
| Travel effort | Directions, Distance Matrix, Routes, Navigation SDK | Travel time, route difficulty, ETA |
| Road geometry | Roads, Elevation | Road snapping, slope, entrance accessibility |
| Optimization | Route Optimization | Best ordering among multiple candidate areas |
| Visualization | Maps JavaScript, Static, Embed, Tiles, Aerial View, Street View Static | Maps, report figures, demo visuals |
| Data management | Datasets, Map Management | Custom parking datasets and map styles |
| Mobile extension | Android/iOS SDKs, 3D SDKs | Future mobile app and 3D display |

## AI File Structure

The AI is implemented as separate importable files:

```text
js/ai/
  parking-availability-ai.js
  ai-utils.js
  feature-extractor.js
  google-signals.js
  search-model.js
  decision-tree-model.js
  bayesian-model.js
  instance-learning-model.js
  neural-score-model.js
  responsible-ai.js
```

The website should continue to import only the main AI entry file.

## How to Run

The site is static, so it can run with a local web server.

### Included PowerShell Server

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-server.ps1
```

Then open:

```text
http://127.0.0.1:8090
```

### Secure Local Server

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-secure-local-server.ps1
```

### Caddy HTTPS Server

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-caddy-secure-server.ps1
```

Then open:

```text
https://localhost:8447
```

## API Key Configuration

Copy `.env.example` to `.env` for local testing and put a restricted Google Cloud key in `GOOGLE_MAPS_API_KEY` or `GEOCODING_API_KEY`. Do not commit `.env`, `runtime-config.json`, or generated local certificates.

The local PowerShell server exposes only a safe runtime config endpoint:

```text
/runtime-config.json
```

Direct access to `.env` is blocked.

Security notes:

- Restrict any Google Cloud browser key by HTTP referrer and enabled APIs.
- Rotate any key that was previously stored in plain text or shared.
- The included PowerShell servers block dotfiles and resolve static paths under the project root.

## Access Model

The current version opens directly into a local workspace. There is no login screen, no role picker, and no demo credential display. Hidden local workspace identities are created only so parking-area setup, slot status simulation, logs, and AI prediction can keep using the existing data functions. The project intentionally does not book, reserve, or assign a specific parking spot to a user.

## Suggested Research Paper Structure

1. Abstract
2. Introduction
3. Problem statement
4. Literature and syllabus background
5. System architecture
6. Google API signal collection
7. Feature engineering
8. Search-based parking recommendation
9. Explainable machine learning model
10. Responsible AI design
11. Implementation
12. Testing and evaluation
13. Results and discussion
14. Limitations
15. Future work
16. Conclusion
17. References

## Suggested PPT Structure

1. Title slide
2. Problem statement
3. Motivation
4. Syllabus concepts used
5. System architecture
6. Google API signal sources
7. AI feature extraction
8. Search problem formulation
9. Decision tree model
10. Bayesian model
11. Instance-based learning
12. Neural score
13. Responsible AI explanation
14. Demo screenshots
15. Results
16. Limitations
17. Future scope
18. Conclusion

## MiKTeX Report

A MiKTeX-ready LaTeX report draft is available at:

```text
docs/report.tex
```

Compile it from the project root with:

```powershell
pdflatex -interaction=nonstopmode -output-directory docs docs\report.tex
pdflatex -interaction=nonstopmode -output-directory docs docs\report.tex
```

Run twice so the table of contents and cross-references are updated.

## References

The project is based on the course reference areas:

- Stuart Russell and Peter Norvig, Artificial Intelligence: A Modern Approach.
- Tom M. Mitchell, Machine Learning.
- NASSCOM Responsible AI Architect Guide.
- Melanie Mitchell, Artificial Intelligence: A Guide for Thinking Humans.

## Limitations

- Exact Google Maps "Popular times" data is not available through public APIs.
- Browser-side API calls expose more risk than backend API calls.
- Predictions are estimates, not guarantees.
- More real parking logs are required for stronger evaluation.
- Some Google APIs are SDK, visualization, or management services, so they are represented in the API catalog but not forced into every prediction request.

## Future Work

- Add backend proxy for secure API calls.
- Add Firebase or Supabase for persistent storage.
- Add evaluation metrics such as MAE and prediction accuracy.
- Add monitoring that compares predicted availability with actual availability.
- Add real sensor/device data ingestion instead of simulated sensor updates.
