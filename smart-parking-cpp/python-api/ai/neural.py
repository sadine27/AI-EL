"""
Neural model (Unit 3).

A compact single-hidden-layer feed-forward network with fixed, hand-tuned
weights (no training data required). It captures non-linear interactions between
demand, time pressure, supply scarcity, environment and access that the linear
and rule-based models miss — e.g. high demand AND tight supply together push
occupancy disproportionately high.

Architecture: 5 inputs -> 4 tanh hidden units -> 1 sigmoid output.
"""

from __future__ import annotations

import math

# Hidden layer weights: 4 neurons x 5 inputs
# inputs = [demand, timePressure, supplyTightness, environment, route]
_W1 = [
    [1.8, 1.2, 1.5, 0.5, 0.3],   # "core demand vs supply" neuron
    [1.4, 1.6, 0.4, 0.2, 0.2],   # "rush hour" neuron
    [0.6, 0.3, 1.7, 0.9, 0.6],   # "scarcity & friction" neuron
    [0.9, 0.7, 0.8, 1.1, 0.9],   # "discomfort drives circling" neuron
]
_B1 = [-2.2, -1.9, -1.7, -1.6]

# Output layer weights: 1 neuron x 4 hidden
_W2 = [1.5, 1.1, 1.3, 0.8]
_B2 = -1.1


def _tanh(x: float) -> float:
    return math.tanh(x)


def _sigmoid(x: float) -> float:
    if x < -60:
        return 0.0
    if x > 60:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


def neural_pressure(f: dict) -> dict:
    """Return {score} occupancy pressure from the neural scorer."""
    x = [
        max(0.0, min(1.0, f.get("demand", 0.0))),
        max(0.0, min(1.0, f.get("timePressure", 0.0))),
        max(0.0, min(1.0, f.get("supplyTightness", 0.5))),
        max(0.0, min(1.0, f.get("environment", 0.0))),
        max(0.0, min(1.0, f.get("route", 0.0))),
    ]

    hidden = []
    for weights, bias in zip(_W1, _B1):
        z = sum(w * xi for w, xi in zip(weights, x)) + bias
        hidden.append(_tanh(z))

    out = sum(w * h for w, h in zip(_W2, hidden)) + _B2
    score = _sigmoid(out)

    return {"score": round(score, 4)}
