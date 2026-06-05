"""
Bayesian learning (Unit 3).

A naive Bayes classifier that estimates the posterior probability of the area
being in a "high occupancy" state given discretised situational evidence.
Likelihood tables are expert-elicited priors (a small, transparent model) so the
result stays explainable and works without a training dataset.

    P(High | E) = P(High) * Π P(eᵢ | High)
                  ----------------------------------------
                  Σ_c P(c) * Π P(eᵢ | c)      , c ∈ {High, Low}
"""

from __future__ import annotations

# Prior probability of a "high occupancy" state for an arbitrary area/time.
_PRIOR_HIGH = 0.45
_PRIOR_LOW = 1.0 - _PRIOR_HIGH

# Likelihood P(evidence_level | class). Each feature is discretised into
# low / medium / high buckets. Values are smoothed and need not sum to 1
# across buckets (they are per-bucket likelihoods), but are kept sensible.
_LIKELIHOOD = {
    "demand": {
        "high": {"high": 0.70, "low": 0.15},
        "medium": {"high": 0.25, "low": 0.45},
        "low": {"high": 0.05, "low": 0.40},
    },
    "timePressure": {
        "high": {"high": 0.60, "low": 0.20},
        "medium": {"high": 0.30, "low": 0.40},
        "low": {"high": 0.10, "low": 0.40},
    },
    "supplyTightness": {
        "high": {"high": 0.62, "low": 0.22},
        "medium": {"high": 0.28, "low": 0.40},
        "low": {"high": 0.10, "low": 0.38},
    },
    "environment": {
        "high": {"high": 0.55, "low": 0.30},
        "medium": {"high": 0.30, "low": 0.38},
        "low": {"high": 0.15, "low": 0.32},
    },
}


def _bucket(v: float) -> str:
    if v >= 0.6:
        return "high"
    if v >= 0.33:
        return "medium"
    return "low"


def bayesian_pressure(f: dict) -> dict:
    """Return {score, posteriorHigh, evidence} naive-Bayes posterior of high occupancy."""
    likelihood_high = _PRIOR_HIGH
    likelihood_low = _PRIOR_LOW
    evidence: dict[str, str] = {}

    for feature, table in _LIKELIHOOD.items():
        level = _bucket(max(0.0, min(1.0, f.get(feature, 0.0))))
        evidence[feature] = level
        likelihood_high *= table[level]["high"]
        likelihood_low *= table[level]["low"]

    denom = likelihood_high + likelihood_low
    posterior = likelihood_high / denom if denom > 0 else _PRIOR_HIGH

    return {"score": round(posterior, 4), "posteriorHigh": round(posterior, 4), "evidence": evidence}
