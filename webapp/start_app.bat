@echo off
REM ============================================================
REM  Smart Parking AI - one-click launcher
REM  Starts the FastAPI backend (:8000) and serves the frontend
REM  over http (:3000, an allowed CORS origin) then opens the UI.
REM  Close either minimized window to stop the app.
REM ============================================================
title Smart Parking AI launcher

set "ROOT=C:\My Desktop\college\studies\academics\first year\II semister\AI\_ai-el-pr\webapp"

REM --- Backend API (predictor) on port 8000 ---
start "Smart Parking API" /min cmd /k "cd /d "%ROOT%\backend" && py -3.12 app.py"

REM --- Frontend static server on port 3000 (CORS-allowed origin) ---
start "Smart Parking Web" /min cmd /k "cd /d "%ROOT%\frontend" && py -3.12 -m http.server 3000"

REM --- Give the servers a moment, then open the UI ---
REM  Append a unique cache-buster (%RANDOM%) so the browser can never serve a
REM  stale copy of an older index.html it cached for this URL.
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000/index.html?v=%RANDOM%%RANDOM%"

exit
