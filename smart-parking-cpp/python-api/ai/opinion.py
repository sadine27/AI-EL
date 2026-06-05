"""
Explainable AI opinion (Unit 1 & Unit 5 — responsible / human-centred AI).

Turns the numeric model outputs into a plain-English verdict, the reasons behind
it (so the prediction is transparent, not a black box), and an actionable
recommendation including the A*-derived best arrival time.
"""

from __future__ import annotations


def _fmt_time(hour: int) -> str:
    hour %= 24
    suffix = "am" if hour < 12 else "pm"
    h12 = hour % 12
    if h12 == 0:
        h12 = 12
    return f"{h12}{suffix}"


def _reasons(f: dict, capacity_info: dict, models: dict) -> list[str]:
    """Rank the factors that most influenced the prediction (explainability)."""
    reasons: list[tuple[float, str]] = []

    demand = f["demand"]
    if demand >= 0.66:
        reasons.append((demand, f"Strong nearby demand — {f['poiCount']} active places drawing traffic"))
    elif demand >= 0.40:
        reasons.append((demand, f"Moderate nearby demand from {f['poiCount']} places"))
    else:
        reasons.append((0.5 - demand, "Few busy places nearby, so demand is low"))

    tp = f["timePressure"]
    if tp >= 0.6:
        when = "weekend afternoon/evening" if f["weekend"] else "a peak rush hour"
        reasons.append((tp, f"It's {when} ({_fmt_time(f['hour'])}), a high-traffic window"))
    elif tp <= 0.25:
        reasons.append((0.4, f"Off-peak time ({_fmt_time(f['hour'])}) eases competition"))

    st = f["supplyTightness"]
    if st >= 0.6:
        reasons.append((st, "Limited parking capacity relative to the crowd"))
    elif st <= 0.3 and capacity_info.get("totalCapacity", 0) > 0:
        reasons.append((0.4, "Plenty of parking capacity for the area"))

    env = f["environment"]
    if env >= 0.45:
        reasons.append((env, "Poor weather/air conditions push more people to drive"))

    if f["route"] >= 0.5:
        reasons.append((f["route"], "Access roads are slow, so cars linger longer"))

    bayes = models["bayesian"]["score"]
    reasons.append((0.2, f"Bayesian model puts the chance of a 'busy' state at {int(round(bayes * 100))}%"))

    reasons.sort(key=lambda r: r[0], reverse=True)
    return [text for _, text in reasons[:4]]


def build_opinion(features, occupancy, verdict, risk_label, demand_label,
                  capacity_info, estimated_available, models, arrival) -> dict:
    """Assemble the human-readable opinion block."""
    occ_pct = int(round(occupancy * 100))
    capacity = capacity_info.get("totalCapacity", 0)

    if verdict == "Easy":
        headline = f"Parking looks easy here — about {estimated_available} of ~{capacity} spots likely free."
    elif verdict == "Moderate":
        headline = f"Parking is doable but filling up — roughly {estimated_available} of ~{capacity} spots likely free."
    elif verdict == "Hard":
        headline = f"Expect a tight search — only about {estimated_available} of ~{capacity} spots likely free."
    else:
        headline = f"Parking will be very hard — perhaps {estimated_available} of ~{capacity} spots free at best."

    reasons = _reasons(features, capacity_info, models)

    # Recommendation, informed by the A* arrival search.
    if arrival.get("improvesIfWait") and arrival.get("bestSlotMinutesAhead", 0) > 0:
        best_occ = int(round(arrival["bestOccupancy"] * 100))
        mins = arrival["bestSlotMinutesAhead"]
        recommendation = (
            f"If you can wait ~{mins} min (around {_fmt_time(arrival['bestHour'])}), "
            f"predicted occupancy drops to about {best_occ}%."
        )
    elif verdict in ("Hard", "Very hard"):
        recommendation = (
            "Consider a park-and-walk lot a little further out, or use a paid garage "
            "which usually keeps some turnover even when street parking is full."
        )
    else:
        recommendation = "Now is a good time to go — conditions are favourable."

    return {
        "verdict": verdict,
        "headline": headline,
        "occupancyPct": occ_pct,
        "reasons": reasons,
        "recommendation": recommendation,
        "summary": (
            f"{verdict} to park ({occ_pct}% predicted occupancy). "
            f"{demand_label} demand, {risk_label.lower()} risk. {recommendation}"
        ),
    }
