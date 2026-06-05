# Security Review

Date: 2026-05-12

## Scope

Repository-wide review of the static Smart Parking web app, local PowerShell server scripts, runtime configuration files, certificates, documentation, and Git ignore policy.

## Threat Model

- The app is a static browser application with no production backend.
- Parking data, workspace users, API settings, and demo state are stored in browser `localStorage`.
- Live Google Maps Platform calls use a browser-visible API key and must therefore rely on Google Cloud API restrictions.
- Local development servers serve static files and a generated `runtime-config.json` response from `.env`.
- Self-signed HTTPS certificates are local development material only.

## Findings And Fixes

### 1. Local Google API key in plain-text config

Status: fixed locally and excluded from Git.

The local `.env` and `runtime-config.json` files contained a live Google API key. Both files are ignored by Git, but plain-text local copies are still risky if zipped, shared, or accidentally committed later.

Fixes applied:

- Replaced local `.env` and `runtime-config.json` values with empty placeholders.
- Added `.env.example` and `runtime-config.example.json`.
- Updated docs and UI copy to avoid encouraging committed runtime keys.

Required follow-up outside this repository: rotate the exposed Google Cloud key and restrict the replacement key by HTTP referrer and enabled APIs.

### 2. Static server path traversal risk

Status: fixed.

The custom PowerShell servers previously joined request paths directly to the project root. Encoded or relative path segments could make that pattern fragile.

Fixes applied:

- Added `scripts/server-common.ps1`.
- All custom server scripts now decode request paths, block dotfile path segments, resolve candidate paths with `GetFullPath`, and verify they stay inside the project root before serving.

### 3. Old TLS versions in local HTTPS script

Status: fixed.

`scripts/start-secure-local-server.ps1` previously allowed TLS 1.0 and 1.1.

Fix applied:

- Restricted the script to TLS 1.2.

### 4. Local-only certificates and generated state

Status: controlled by ignore rules.

`certs/`, `.caddy-config/`, `.caddy-data/`, and `https-server.log` are ignored. Do not commit self-signed private keys or generated local server state.

### 5. Browser-side trust boundaries

Status: documented residual risk.

This is a demo/static app, so there is no server-side authentication or authorization. Data in `localStorage` can be edited by the browser user. Treat this as a local prototype, not a production parking-control backend.

## Verification Commands

```powershell
Select-String -Path .env,runtime-config.json,.env.example,runtime-config.example.json -Pattern 'AIza'
rg -n --hidden --no-ignore -g '!certs/**' -g '!docs/*.pdf' -g '!*.png' 'AIza[0-9A-Za-z_-]{20,}|10\.14\.29\.30'
rg -n 'innerHTML|window\.open|localStorage|fetch\(' js index.html
```

The first two checks returned no exposed Google API key or old hardcoded LAN IP after remediation.
