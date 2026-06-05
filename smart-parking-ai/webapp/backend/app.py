import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
import math
from typing import Dict

app = FastAPI(title="Smart Parking Predictor", version="1.0.0")

# Explicit origins; no credentials since this API uses no cookies/auth.
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

class PredictionInput(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    totalSlots: int = Field(..., ge=1, le=10000)
    unavailable: int = Field(..., ge=0)
    hour: int = Field(..., ge=0, le=23)
    dayOfWeek: int = Field(..., ge=0, le=6)

    @validator('unavailable')
    def clamp_unavailable(cls, v, values):
        if 'totalSlots' in values and v > values['totalSlots']:
            return values['totalSlots']
        return v

class PredictionOutput(BaseModel):
    predictedAvailable: int
    predictedOccupancyPct: float
    riskLabel: str
    demandLabel: str
    confidencePct: float
    modelBreakdown: Dict[str, float]

def rule_based_decision_tree(hour: int, dayOfWeek: int, occupancy_pct: float) -> tuple:
    # Decision tree based on time and occupancy
    is_weekend = dayOfWeek >= 5
    is_rush = hour in [7,8,9,17,18,19]
    is_night = hour < 6 or hour >= 22
    is_midday = 10 <= hour <= 16

    if is_night:
        base_risk = 0.1
        base_demand = "low"
    elif is_rush:
        base_risk = 0.7
        base_demand = "high"
    elif is_midday:
        base_risk = 0.4
        base_demand = "medium"
    else:
        base_risk = 0.3
        base_demand = "medium"

    if is_weekend:
        base_risk *= 0.8
        if base_demand == "high":
            base_demand = "medium"
        elif base_demand == "medium":
            base_demand = "low"

    # Adjust based on occupancy
    if occupancy_pct > 80:
        base_risk = min(1.0, base_risk * 1.5)
        if base_demand != "high":
            base_demand = "high"
    elif occupancy_pct < 30:
        base_risk = max(0.05, base_risk * 0.5)
        if base_demand != "low":
            base_demand = "low"

    return base_risk, base_demand

def weighted_scoring(occupancy_pct: float, hour: int, dayOfWeek: int) -> float:
    # Weighted scoring for confidence
    time_score = 1.0 - abs(hour - 12) / 12 * 0.3
    day_score = 0.8 if dayOfWeek >= 5 else 1.0
    occ_score = 1.0 - abs(occupancy_pct - 50) / 50 * 0.2
    return (time_score * 0.4 + day_score * 0.3 + occ_score * 0.3) * 100

def bayesian_probability(occupancy_pct: float, hour: int, dayOfWeek: int) -> float:
    # Simple Bayesian-style probability
    prior = 0.5
    likelihood = occupancy_pct / 100
    evidence = 0.5 + 0.5 * (1 - abs(hour - 12) / 12)
    posterior = (likelihood * prior) / evidence if evidence > 0 else prior
    return min(1.0, max(0.0, posterior))

@app.get("/api/health")
def health():
    return {"status": "healthy", "version": "1.0.0"}

@app.post("/api/predict", response_model=PredictionOutput)
def predict(data: PredictionInput):
    total = data.totalSlots
    unavailable = data.unavailable
    occupancy_pct = (unavailable / total) * 100

    # Rule-based decision tree
    risk_raw, demand_label = rule_based_decision_tree(data.hour, data.dayOfWeek, occupancy_pct)

    # Weighted scoring
    confidence = weighted_scoring(occupancy_pct, data.hour, data.dayOfWeek)

    # Bayesian probability
    bayes_prob = bayesian_probability(occupancy_pct, data.hour, data.dayOfWeek)

    # Combine for final risk label
    combined_risk = (risk_raw * 0.6 + bayes_prob * 0.4)
    if combined_risk < 0.3:
        risk_label = "low"
    elif combined_risk < 0.6:
        risk_label = "medium"
    else:
        risk_label = "high"

    # Predicted available (with some noise based on time)
    predicted_available = max(0, total - int(unavailable * (1 + (risk_raw - 0.5) * 0.2)))
    predicted_occupancy_pct = ((total - predicted_available) / total) * 100

    # Model breakdown
    model_breakdown = {
        "decisionTreeScore": round(risk_raw, 4),
        "weightedScore": round(confidence / 100, 4),
        "bayesianProbability": round(bayes_prob, 4),
        "combinedRisk": round(combined_risk, 4)
    }

    return PredictionOutput(
        predictedAvailable=predicted_available,
        predictedOccupancyPct=round(predicted_occupancy_pct, 2),
        riskLabel=risk_label,
        demandLabel=demand_label,
        confidencePct=round(confidence, 2),
        modelBreakdown=model_breakdown
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)