"""
Decision Tree learning (Unit 3).

A small, hand-built classification tree that maps the situational features to a
parking-occupancy risk label and a continuous occupancy-pressure score in [0, 1].
The tree is intentionally readable so the decision path can be explained to the
user (explainable AI / responsible AI, Unit 1 & 5).
"""

from __future__ import annotations


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def decision_tree_risk(f: dict) -> dict:
    """Classify occupancy risk from features.

    Returns dict: {label, score, path} where score is occupancy pressure [0,1]
    and path is the human-readable sequence of decisions taken (explainability).
    """
    demand = _clamp(f.get("demand", 0.0))
    time_pressure = _clamp(f.get("timePressure", 0.0))
    supply = _clamp(f.get("supplyTightness", 0.5))
    env = _clamp(f.get("environment", 0.0))
    route = _clamp(f.get("route", 0.0))

    path: list[str] = []

    # Root split on nearby demand.
    if demand >= 0.66:
        path.append("High nearby demand")
        if supply >= 0.6:
            path.append("Parking supply is tight")
            base = 0.86
        elif time_pressure >= 0.5:
            path.append("Within a busy time window")
            base = 0.78
        else:
            path.append("Off-peak hour")
            base = 0.66
    elif demand >= 0.38:
        path.append("Moderate nearby demand")
        if time_pressure >= 0.6 and supply >= 0.55:
            path.append("Busy time and tight supply")
            base = 0.7
        elif time_pressure >= 0.5:
            path.append("Busy time window")
            base = 0.56
        else:
            path.append("Calm time window")
            base = 0.44
    else:
        path.append("Low nearby demand")
        if supply >= 0.7 and time_pressure >= 0.6:
            path.append("Very limited parking at a busy hour")
            base = 0.5
        else:
            path.append("Plenty of parking expected")
            base = 0.28

    # Leaf adjustment: weather discomfort and hard access push occupancy up a bit
    # (people drive/circle more), but cannot dominate the structural decision.
    adjust = env * 0.08 + route * 0.06
    score = _clamp(base + adjust)

    if score >= 0.75:
        label = "Very high"
    elif score >= 0.58:
        label = "High"
    elif score >= 0.42:
        label = "Moderate"
    else:
        label = "Low"

    return {"label": label, "score": round(score, 4), "path": path}
