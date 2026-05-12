# Smart Parking Instruction Manual

## 1. Overview

This is a static browser app for an AI Foundations for Engineers experiential-learning project. It manages a local smart-parking workspace and uses explainable AI modules to estimate short-term parking availability from live parking state, time, route/access, nearby-place, and environmental signals.

## 2. Quick Start

Run the app from the project root with one of these scripts:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-server.ps1
```

Open:

```text
http://127.0.0.1:8090
```

For HTTPS-only browser features such as geolocation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-secure-local-server.ps1
```

Open:

```text
https://localhost:8446
```

Optional Caddy HTTPS server:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-caddy-secure-server.ps1
```

Open:

```text
https://localhost:8447
```

## 3. Google API Key Setup

The app works without a key by using local and fallback signals. Live Google Maps Platform signals need a restricted Google Cloud API key.

1. Copy `.env.example` to `.env`.
2. Add the key to `GOOGLE_MAPS_API_KEY` or `GEOCODING_API_KEY`.
3. Run one of the local server scripts.
4. Open Settings in the app if you prefer to paste or replace the key from the browser.

Do not commit `.env`, `runtime-config.json`, or anything in `certs/`. If a real key was ever saved in plain text or shared, rotate it in Google Cloud Console and restrict the replacement key by HTTP referrer and enabled APIs.

## 4. Main Workflow

1. Open the app.
2. Register or select a parking area.
3. Generate or place parking slots.
4. Simulate slot occupancy or reserve a slot.
5. Use the dashboard to inspect AI availability predictions.
6. Refresh live demand signals after configuring a Google API key.

## 5. Project Structure

```text
EL/
├── assets/images/                 # Syllabus/reference images
├── css/styles.css                 # Application styles
├── docs/report.tex                # LaTeX paper draft
├── docs/report.pdf                # Compiled paper
├── js/app.js                      # Main UI and app logic
├── js/ai/                         # Explainable AI model modules
├── js/modules/                    # Store and Google Maps settings modules
├── js/utils/                      # Geographic helpers
├── scripts/                       # Local server scripts
├── .env.example                   # Local API key template
├── runtime-config.example.json    # Runtime config template
├── Caddyfile                      # Optional Caddy HTTPS config
└── index.html                     # Static app entry point
```

## 6. Troubleshooting

If the app asks for a Google Cloud API key, add one in Settings or configure `.env` and hard-refresh the page.

If geolocation does not work, use HTTPS and allow location for `localhost` in the browser.

If maps are blank, check internet access because map tiles are loaded from external map providers.

If slots or areas disappear, check whether browser `localStorage` was cleared or an incognito profile was used.

If the app opens blank, run one of the server scripts instead of opening `index.html` directly.
