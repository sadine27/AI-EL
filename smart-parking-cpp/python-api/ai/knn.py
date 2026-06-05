"""
Instance-based learning — k-Nearest Neighbours (Unit 3).

Predicts occupancy pressure by comparing the current situation to a small set of
labelled prototype situations and taking a distance-weighted average of the
k closest neighbours' occupancy ratios. The prototypes encode common, intuitive
parking scenarios so the model is meaningful without a large training set.

Feature space: [demand, timePressure, supplyTightness, environment]
"""

from __future__ import annotations

import math

# (features, occupancyRatio, label) prototypes.
_PROTOTYPES: list[tuple[list[float], float, str]] = [
    ([0.90, 0.85, 0.80, 0.40], 0.92, "Mall district, weekend evening, scarce parking"),
    ([0.80, 0.75, 0.55, 0.30], 0.82, "Busy high street at lunch"),
    ([0.70, 0.60, 0.70, 0.50], 0.80, "Dense area, rain, limited lots"),
    ([0.55, 0.55, 0.45, 0.25], 0.60, "Moderate town centre, mid-afternoon"),
    ([0.45, 0.40, 0.40, 0.20], 0.48, "Mixed neighbourhood, normal hours"),
    ([0.35, 0.30, 0.30, 0.15], 0.36, "Quiet area, off-peak"),
    ([0.25, 0.55, 0.25, 0.20], 0.34, "Residential, evening, ample parking"),
    ([0.20, 0.20, 0.20, 0.10], 0.20, "Sparse outskirts, early morning"),
    ([0.60, 0.30, 0.75, 0.30], 0.66, "Few parking options near some shops"),
    ([0.85, 0.50, 0.30, 0.20], 0.62, "Popular area but large car parks"),
]


def _distance(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def knn_pressure(f: dict, k: int = 3) -> dict:
    """Return {score, neighbors, nearest} distance-weighted occupancy estimate."""
    point = [
        max(0.0, min(1.0, f.get("demand", 0.0))),
        max(0.0, min(1.0, f.get("timePressure", 0.0))),
        max(0.0, min(1.0, f.get("supplyTightness", 0.5))),
        max(0.0, min(1.0, f.get("environment", 0.0))),
    ]

    scored = sorted(
        ((_distance(point, proto), occ, label) for proto, occ, label in _PROTOTYPES),
        key=lambda t: t[0],
    )
    k = max(1, min(k, len(scored)))
    neighbours = scored[:k]

    # Distance-weighted vote (inverse distance). Epsilon avoids div-by-zero.
    weight_sum = 0.0
    weighted_occ = 0.0
    for dist, occ, _ in neighbours:
        w = 1.0 / (dist + 1e-3)
        weight_sum += w
        weighted_occ += w * occ

    score = weighted_occ / weight_sum if weight_sum > 0 else neighbours[0][1]

    return {
        "score": round(max(0.0, min(1.0, score)), 4),
        "neighbors": k,
        "nearest": neighbours[0][2],
    }
