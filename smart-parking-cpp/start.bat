@echo off
REM Smart Parking AI - one-click launcher (Windows).
REM Double-click this file to set up, start the app, and open it in your browser.
setlocal
cd /d "%~dp0"

if "%PYTHON_API_PORT%"=="" set PYTHON_API_PORT=8080
set URL=http://localhost:%PYTHON_API_PORT%

echo Smart Parking AI - starting...

REM Create the virtual environment on first run.
if not exist ".venv" (
    echo Creating virtual environment ^(first run only^)...
    python -m venv .venv
)
call .venv\Scripts\activate.bat

echo Installing dependencies...
python -m pip install -q --upgrade pip >nul 2>&1
python -m pip install -q -r requirements.txt

if not exist ".env" if exist ".env.example" (
    echo No .env found. Copy .env.example to .env and add GOOGLE_MAPS_API_KEY for live data.
    echo The app still runs without a key, using density-based estimates.
)

REM Open the browser, then start the server.
start "" /b cmd /c "timeout /t 2 >nul & start %URL%"

echo Open: %URL%   (press Ctrl+C to stop)
cd python-api
python -m uvicorn main:app --host 0.0.0.0 --port %PYTHON_API_PORT%

endlocal
