"""
Smart Parking AI — prediction engine.

This package is the canonical, self-contained AI engine. It implements the
AI Foundations course concepts in pure Python so the web app always produces a
real, explainable prediction without requiring the optional C++ engine:

- decision_tree : rule-based risk classification (Unit 3)
- bayesian      : naive Bayes occupancy posterior (Unit 3, Bayesian learning)
- knn           : instance-based learning over labelled prototypes (Unit 3)
- neural        : small fixed-weight neural scorer (Unit 3)
- search        : A* search over arrival times (Unit 2)
- engine        : feature building, capacity estimation, ensemble, confidence
- opinion       : explainable natural-language recommendation (Unit 1 / Unit 5)
"""

from .engine import predict_occupancy, build_features

__all__ = ["predict_occupancy", "build_features"]
