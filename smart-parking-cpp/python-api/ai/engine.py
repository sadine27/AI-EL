"""
Prediction engine — feature building, ensemble, capacity & availability.

Pipeline:
  signals (places, weather, air, route, parking) + time
      -> build_features()              # situational feature vector
      -> 4 ML models + priors          # ensemble occupancy probability
      -> capacity & availability math  # how many spots are likely free
      -> A* best-arrival search        # when to go
      -> explainable AI opinion
"""

from __future__ import annotations

from datetime import datetime, timezone

from collectors.places import compute_demand_score, estimate_parking_capacity
from collectors.environment import compute_environment_score
from collectors.routing import compute_route_score

from .decision_tree import decision_tree_risk
from .bayesian import bayesian_pressure
from .knn import knn_pressure
from .neural import neural_pressure
from .search import best_arrival_search
from .opinion import build_opinion


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _time_pressure(hour: int, day: int) -> float:
    """Time-of-day demand pressure in [0,1]."""
    hour = max(0, min(23, int(hour)))
    day = max(0, min(6, int(day)))
    weekend = day in (0, 6)
    pressure = 0.30
    if hour in (8, 9, 17, 18, 19) and not weekend:
        pressure += 0.22
    if hour in (12, 13, 18, 19, 20):
        pressure += 0.24
    if weekend and 11 <= hour <= 21:
        pressure += 0.22
    if hour >= 22 or hour <= 6:
        pressure -= 0.22
    return _clamp(pressure, 0.05, 0.95)


def build_features(places, environment, route, capacity_info, hour, day):
    """Build the situational feature vector consumed by every model."""
    places = places if isinstance(places, list) else []
    poi_count = len(places)

    demand = _clamp(compute_demand_score(places, hour, day))
    env = _clamp(compute_environment_score(environment or {}))
    route_score = _clamp(compute_route_score(route or {}))
    time_pressure = _time_pressure(hour, day)

    capacity = max(0, int((capacity_info or {}).get("totalCapacity", 0)))

    # Supply tightness: how scarce parking is relative to expected demand.
    # demand_load ~ number of cars likely competing for spots near here.
    demand_load = max(1, poi_count) * (0.30 + demand) * 18.0
    supply_tightness = _clamp(demand_load / (demand_load + max(capacity, 1)))

    weekend = day in (0, 6)
    peak_hour = hour in (8, 9, 12, 13, 17, 18, 19, 20)

    return {
        "demand": demand,
        "timePressure": time_pressure,
        "environment": env,
        "route": route_score,
        "supplyTightness": supply_tightness,
        "hour": int(hour),
        "day": int(day),
        "weekend": weekend,
        "peakHour": peak_hour,
        "poiCount": poi_count,
        "capacity": capacity,
    }


# Ensemble weights (sum to 1.0).
_W_DECISION = 0.30
_W_BAYES = 0.22
_W_KNN = 0.20
_W_NEURAL = 0.16
_W_PRIOR = 0.12


def _prior_blend(f: dict) -> float:
    return _clamp(0.40 * f["demand"] + 0.30 * f["timePressure"] + 0.30 * f["supplyTightness"])


def ensemble_occupancy(f: dict) -> float:
    """Combine all models into a single occupancy probability [0,1]."""
    dt = decision_tree_risk(f)["score"]
    bayes = bayesian_pressure(f)["score"]
    knn = knn_pressure(f)["score"]
    neural = neural_pressure(f)["score"]
    occ = (
        _W_DECISION * dt
        + _W_BAYES * bayes
        + _W_KNN * knn
        + _W_NEURAL * neural
        + _W_PRIOR * _prior_blend(f)
    )
    return _clamp(occ)


def run_models(f: dict) -> dict:
    """Run every model and return detailed, explainable outputs."""
    dt = decision_tree_risk(f)
    bayes = bayesian_pressure(f)
    knn = knn_pressure(f)
    neural = neural_pressure(f)
    occupancy = ensemble_occupancy(f)
    return {
        "occupancy": occupancy,
        "decisionTree": dt,
        "bayesian": bayes,
        "knn": knn,
        "neural": neural,
    }


def _demand_label(demand: float) -> str:
    return "Heavy" if demand >= 0.66 else "Moderate" if demand >= 0.40 else "Light"


def _verdict(occ: float) -> str:
    if occ >= 0.80:
        return "Very hard"
    if occ >= 0.65:
        return "Hard"
    if occ >= 0.45:
        return "Moderate"
    return "Easy"


def _risk_label(occ: float) -> str:
    """Overall risk from the ensemble occupancy (keeps hero labels consistent)."""
    if occ >= 0.75:
        return "Very high"
    if occ >= 0.58:
        return "High"
    if occ >= 0.42:
        return "Moderate"
    return "Low"


def _confidence(f: dict, ready_signals: int, real_places: bool, real_parking: bool) -> int:
    score = 0.34
    score += min(ready_signals, 8) * 0.035
    score += 0.15 if real_places else 0.0
    score += 0.15 if real_parking else 0.0
    score += 0.06 if f["capacity"] > 0 else 0.0
    return int(round(_clamp(score) * 100))


def _per_lot_breakdown(lots: list, area_occ: float) -> list:
    """Estimate per-lot occupancy and free spaces around the area average."""
    out = []
    for i, lot in enumerate(lots):
        stalls = max(1, int(lot.get("estStalls", 0)))
        # Larger lots/garages turn over a little more; tiny street parking fills first.
        type_bias = -0.05 if stalls >= 200 else (0.06 if stalls <= 20 else 0.0)
        # Small deterministic spread so lots differ without randomness.
        spread = ((i % 3) - 1) * 0.04
        lot_occ = _clamp(area_occ + type_bias + spread)
        out.append({
            "name": lot.get("name", "Parking"),
            "type": lot.get("type", "parking"),
            "estStalls": stalls,
            "estAvailable": max(0, int(round(stalls * (1.0 - lot_occ)))),
            "occupancyPct": int(round(lot_occ * 100)),
            "lat": lot.get("lat"),
            "lng": lot.get("lng"),
        })
    return out


def predict_occupancy(
    places: list,
    environment: dict,
    route: dict,
    parking: list,
    hour: int | None = None,
    day: int | None = None,
    ready_signals: int = 0,
) -> dict:
    """Full prediction: estimate nearby capacity and predict occupancy & free spots."""
    now = datetime.now(timezone.utc)
    hour = now.hour if hour is None else int(hour)
    day = now.weekday() if day is None else int(day)

    parking = parking if isinstance(parking, list) else []
    places = places if isinstance(places, list) else []

    capacity_info = estimate_parking_capacity(parking, places)
    f = build_features(places, environment, route, capacity_info, hour, day)

    models = run_models(f)
    occupancy = models["occupancy"]

    capacity = capacity_info["totalCapacity"]
    estimated_available = max(0, int(round(capacity * (1.0 - occupancy))))

    # A* search for the best arrival time.
    arrival = best_arrival_search(f, ensemble_occupancy, start_hour=hour, start_day=day)

    risk_label = _risk_label(occupancy)
    demand_label = _demand_label(f["demand"])
    verdict = _verdict(occupancy)
    confidence = _confidence(
        f, ready_signals,
        real_places=len(places) > 0,
        real_parking=capacity_info.get("source") == "live",
    )

    lots = _per_lot_breakdown(capacity_info.get("lots", []), occupancy)

    opinion = build_opinion(
        features=f,
        occupancy=occupancy,
        verdict=verdict,
        risk_label=risk_label,
        demand_label=demand_label,
        capacity_info=capacity_info,
        estimated_available=estimated_available,
        models=models,
        arrival=arrival,
    )

    return {
        "occupancyProbabilityPct": int(round(occupancy * 100)),
        "estimatedCapacity": capacity,
        "estimatedAvailable": estimated_available,
        "capacitySource": capacity_info.get("source", "estimated"),
        "riskLabel": risk_label,
        "demandLabel": demand_label,
        "demandScore": round(f["demand"], 3),
        "verdict": verdict,
        "confidencePct": confidence,
        "horizonMinutes": 30,
        "parkingLots": lots,
        "modelBreakdown": {
            "decisionTree": models["decisionTree"]["label"],
            "decisionTreeScore": int(round(models["decisionTree"]["score"] * 100)),
            "decisionPath": models["decisionTree"]["path"],
            "bayes": int(round(models["bayesian"]["score"] * 100)),
            "knn": int(round(models["knn"]["score"] * 100)),
            "knnNearest": models["knn"]["nearest"],
            "neural": int(round(models["neural"]["score"] * 100)),
            "environment": int(round(f["environment"] * 100)),
            "routeAccess": int(round(f["route"] * 100)),
            "supplyTightness": int(round(f["supplyTightness"] * 100)),
        },
        "bestArrival": arrival,
        "aiOpinion": opinion,
        "engine": "python-ai",
    }
