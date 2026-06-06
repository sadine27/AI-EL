"""
Smart Parking Predictor — MySQL-backed webapp backend.

Same API contract as app.py (see predictor.py), but parking lots are served from
the `parking_lots` table and every prediction is persisted to `predictions`.
If MySQL is unreachable the endpoints degrade gracefully: lots fall back to the
seed list and predictions are simply not persisted, so the frontend keeps working.
"""

import os

import mysql.connector
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from predictor import PredictionInput, PredictionOutput, SEED_LOTS, predict

app = FastAPI(title="Smart Parking Predictor", version="1.0.0")

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:8000,http://127.0.0.1:3000,http://127.0.0.1:8000",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "smart_parking"),
}


def get_conn():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error:
        return None


@app.get("/api/health")
def health():
    conn = get_conn()
    db_status = "connected" if conn else "disconnected"
    if conn:
        conn.close()
    return {"status": "healthy", "db": db_status, "version": "1.0.0"}


@app.get("/api/lots")
def get_lots():
    """Serve lots from MySQL; fall back to the seed list when the DB is down."""
    conn = get_conn()
    if not conn:
        return SEED_LOTS
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM parking_lots")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return rows if rows else SEED_LOTS
    except mysql.connector.Error:
        if conn:
            conn.close()
        return SEED_LOTS


@app.post("/api/predict", response_model=PredictionOutput)
def predict_endpoint(data: PredictionInput):
    result = predict(data)

    conn = get_conn()
    if conn:
        try:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO predictions (lat, lng, total_slots, unavailable, hour, "
                "day_of_week, predicted_available, predicted_occupancy_pct, risk_label, "
                "demand_label, confidence_pct) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    data.lat, data.lng, data.totalSlots, data.unavailable, data.hour,
                    data.dayOfWeek, result.predictedAvailable, result.occupancyPercent,
                    result.riskLabel, result.demandLabel, result.confidencePercent,
                ),
            )
            conn.commit()
            cursor.close()
            conn.close()
        except mysql.connector.Error:
            if conn:
                conn.close()

    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
