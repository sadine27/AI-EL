"""
Shared prediction logic and API contract for the standalone Smart Parking webapp.

Both backends import from here:
  - app.py     — DB-free, returns a static seed list of lots
  - app_db.py  — MySQL-backed, persists predictions and serves lots from the DB

Keeping the Pydantic models and the ensemble math in one place guarantees the two
backends speak the EXACT same contract that webapp/frontend/index.html expects:

  request  (snake_case from the browser form, camelCase also accepted):
      latitude / longitude / total_slots / unavailable_slots / hour / day_of_week

  response (consumed by the frontend's renderResult):
      predictedAvailable : int
      occupancyPercent   : float        # drives the occupancy bar + risk badge
      confidencePercent  : float
      riskLabel          : str          # extra context (frontend recomputes its own)
      demandLabel        : str
      modelBreakdown     : [ {modelName, prediction, confidence}, ... ]   # ARRAY
"""

import hashlib

from typing import List

from pydantic import BaseModel, Field, field_validator
from pydantic import AliasChoices, ConfigDict, model_validator

# ------------------------------------------------------------
# Seed parking lots — used by the DB-free backend (app.py) and as the fallback
# for app_db.py when MySQL is unreachable, so the frontend's lot grid always fills.
# ------------------------------------------------------------
SEED_LOTS = [
    {"id": 1, "name": "Phoenix Marketcity Kurla", "lat": 19.0760, "lng": 72.8777, "total_slots": 500},
    {"id": 2, "name": "Infinity Mall Malad", "lat": 19.1860, "lng": 72.8490, "total_slots": 400},
    {"id": 3, "name": "Chhatrapati Shivaji Terminus", "lat": 18.9398, "lng": 72.8355, "total_slots": 200},
    {"id": 4, "name": "Juhu Beach Parking", "lat": 19.0880, "lng": 72.8260, "total_slots": 150},
    {"id": 5, "name": "Bandra Kurla Complex", "lat": 19.0630, "lng": 72.8680, "total_slots": 300},
]


# ------------------------------------------------------------
# Request / response models (the contract the frontend was built against)
# ------------------------------------------------------------
class PredictionInput(BaseModel):
    """Accepts the browser form's snake_case field names and camelCase aliases."""

    model_config = ConfigDict(populate_by_name=True)

    lat: float = Field(
        ..., ge=-90, le=90,
        validation_alias=AliasChoices("latitude", "lat"),
    )
    lng: float = Field(
        ..., ge=-180, le=180,
        validation_alias=AliasChoices("longitude", "lng"),
    )
    totalSlots: int = Field(
        ..., ge=1, le=10000,
        validation_alias=AliasChoices("total_slots", "totalSlots"),
    )
    unavailable: int = Field(
        ..., ge=0,
        validation_alias=AliasChoices("unavailable_slots", "unavailable"),
    )
    hour: int = Field(..., ge=0, le=23)
    dayOfWeek: int = Field(
        ..., ge=0, le=6,
        validation_alias=AliasChoices("day_of_week", "dayOfWeek"),
    )

    @field_validator("hour", "dayOfWeek", "totalSlots", "unavailable", mode="before")
    @classmethod
    def reject_non_finite(cls, v):
        # Guard against NaN/inf slipping through JSON into int fields.
        if isinstance(v, float) and (v != v or v in (float("inf"), float("-inf"))):
            raise ValueError("value must be finite")
        return v

    @model_validator(mode="after")
    def clamp_unavailable(self):
        # Unavailable can never exceed capacity.
        if self.unavailable > self.totalSlots:
            self.unavailable = self.totalSlots
        return self


class ModelBreakdownItem(BaseModel):
    modelName: str
    prediction: str
    confidence: float


class PredictionOutput(BaseModel):
    predictedAvailable: int
    occupancyPercent: float
    confidencePercent: float
    riskLabel: str
    demandLabel: str
    modelBreakdown: List[ModelBreakdownItem]


# ------------------------------------------------------------
# Ensemble math (rule-based decision tree + weighted score + Bayesian)
# ------------------------------------------------------------
def rule_based_decision_tree(hour: int, day_of_week: int, occupancy_pct: float) -> tuple:
    is_weekend = day_of_week >= 5
    is_rush = hour in [7, 8, 9, 17, 18, 19]
    is_night = hour < 6 or hour >= 22
    is_midday = 10 <= hour <= 16

    if is_night:
        base_risk, base_demand = 0.1, "low"
    elif is_rush:
        base_risk, base_demand = 0.7, "high"
    elif is_midday:
        base_risk, base_demand = 0.4, "medium"
    else:
        base_risk, base_demand = 0.3, "medium"

    if is_weekend:
        base_risk *= 0.8
        if base_demand == "high":
            base_demand = "medium"
        elif base_demand == "medium":
            base_demand = "low"

    if occupancy_pct > 80:
        base_risk = min(1.0, base_risk * 1.5)
        if base_demand != "high":
            base_demand = "high"
    elif occupancy_pct < 30:
        base_risk = max(0.05, base_risk * 0.5)
        if base_demand != "low":
            base_demand = "low"

    return base_risk, base_demand


def weighted_scoring(occupancy_pct: float, hour: int, day_of_week: int) -> float:
    time_score = 1.0 - abs(hour - 12) / 12 * 0.3
    day_score = 0.8 if day_of_week >= 5 else 1.0
    occ_score = 1.0 - abs(occupancy_pct - 50) / 50 * 0.2
    return (time_score * 0.4 + day_score * 0.3 + occ_score * 0.3) * 100


def bayesian_probability(occupancy_pct: float, hour: int, day_of_week: int) -> float:
    prior = 0.5
    likelihood = occupancy_pct / 100
    evidence = 0.5 + 0.5 * (1 - abs(hour - 12) / 12)
    posterior = (likelihood * prior) / evidence if evidence > 0 else prior
    return min(1.0, max(0.0, posterior))


def predict(data: PredictionInput) -> PredictionOutput:
    """Run the ensemble and return the response in the frontend's contract."""
    total = data.totalSlots
    unavailable = data.unavailable
    occupancy_pct = (unavailable / total) * 100

    risk_raw, demand_label = rule_based_decision_tree(data.hour, data.dayOfWeek, occupancy_pct)
    confidence = weighted_scoring(occupancy_pct, data.hour, data.dayOfWeek)
    bayes_prob = bayesian_probability(occupancy_pct, data.hour, data.dayOfWeek)

    combined_risk = risk_raw * 0.6 + bayes_prob * 0.4
    if combined_risk < 0.3:
        risk_label = "low"
    elif combined_risk < 0.6:
        risk_label = "medium"
    else:
        risk_label = "high"

    # Forecast free slots from the risk-adjusted demand, but never report more
    # than are physically free right now (total - unavailable): the prediction
    # may be more pessimistic than the live count, never more optimistic.
    predicted_available = max(0, total - int(unavailable * (1 + (risk_raw - 0.5) * 0.2)))
    predicted_available = min(predicted_available, total - unavailable)
    predicted_occupancy_pct = ((total - predicted_available) / total) * 100

    # modelBreakdown as the ARRAY of {modelName, prediction, confidence} the UI renders.
    model_breakdown = [
        ModelBreakdownItem(
            modelName="Decision Tree",
            prediction=demand_label.capitalize() + " demand",
            confidence=round(risk_raw * 100, 1),
        ),
        ModelBreakdownItem(
            modelName="Weighted Score",
            prediction=f"{confidence:.0f}/100",
            confidence=round(confidence, 1),
        ),
        ModelBreakdownItem(
            modelName="Bayesian",
            prediction=f"{bayes_prob * 100:.0f}% occupancy odds",
            confidence=round(bayes_prob * 100, 1),
        ),
        ModelBreakdownItem(
            modelName="Combined Risk",
            prediction=risk_label.capitalize() + " risk",
            confidence=round(combined_risk * 100, 1),
        ),
    ]

    return PredictionOutput(
        predictedAvailable=predicted_available,
        occupancyPercent=round(predicted_occupancy_pct, 2),
        confidencePercent=round(confidence, 2),
        riskLabel=risk_label,
        demandLabel=demand_label,
        modelBreakdown=model_breakdown,
    )


# ------------------------------------------------------------
# Availability ESTIMATE for real-world lots (e.g. from OpenStreetMap) where we
# have a location and a capacity but NO live occupancy feed. We can't measure how
# full a street parking lot is, so we estimate occupancy from the same time-of-day
# / day-of-week demand model, plus a small DETERMINISTIC per-lot offset (seeded by
# the lot's stable id) so two lots at the same time read differently but never
# jump around between refreshes. This is clearly an AI estimate, not a live count.
# ------------------------------------------------------------
def _lot_offset(seed: str) -> float:
    """Stable pseudo-random value in [0,1) derived from a lot's id."""
    if not seed:
        return 0.5
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def estimate_lot_availability(capacity: int, hour: int, day_of_week: int,
                              seed: str = "") -> dict:
    """Estimate a lot's current availability from time/day demand + a stable
    per-lot offset. Returns the same field names the frontend already renders."""
    capacity = max(1, int(capacity))
    # Base demand for this hour/day at a neutral 50% occupancy reference.
    risk_raw, demand_label = rule_based_decision_tree(hour, day_of_week, 50.0)
    # +/-15% deterministic spread so nearby lots aren't all identical.
    offset = (_lot_offset(seed) - 0.5) * 0.30
    occ = min(0.98, max(0.03, risk_raw + offset))

    unavailable = round(capacity * occ)
    available = max(0, capacity - unavailable)
    occupancy_pct = unavailable / capacity * 100
    confidence = weighted_scoring(occupancy_pct, hour, day_of_week)

    if occ < 0.40:
        risk_label = "low"
    elif occ < 0.75:
        risk_label = "medium"
    else:
        risk_label = "high"

    return {
        "predictedAvailable": int(available),
        "capacity": capacity,
        "occupancyPercent": round(occupancy_pct, 1),
        "confidencePercent": round(confidence, 1),
        "riskLabel": risk_label,
        "demandLabel": demand_label,
    }
