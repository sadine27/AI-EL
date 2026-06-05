"""
Tests for the AI engine package (decision tree, Bayes, KNN, neural, A*, ensemble)
and the parking-capacity estimator.
"""

import os
import pytest

os.environ.setdefault("SERVE_FRONTEND", "0")

from ai.decision_tree import decision_tree_risk
from ai.bayesian import bayesian_pressure
from ai.knn import knn_pressure
from ai.neural import neural_pressure
from ai.search import best_arrival_search
from ai.engine import build_features, ensemble_occupancy, predict_occupancy
from collectors.places import estimate_parking_capacity


HIGH = {"demand": 0.9, "timePressure": 0.85, "supplyTightness": 0.8,
        "environment": 0.4, "route": 0.5, "hour": 19, "day": 6,
        "weekend": True, "peakHour": True, "poiCount": 8, "capacity": 120}
LOW = {"demand": 0.15, "timePressure": 0.15, "supplyTightness": 0.2,
       "environment": 0.0, "route": 0.0, "hour": 4, "day": 2,
       "weekend": False, "peakHour": False, "poiCount": 0, "capacity": 200}


class TestModels:
    def test_decision_tree_monotonic(self):
        assert decision_tree_risk(HIGH)["score"] > decision_tree_risk(LOW)["score"]
        assert decision_tree_risk(HIGH)["label"] in ("High", "Very high")
        assert "path" in decision_tree_risk(HIGH)

    def test_bayes_range_and_order(self):
        hi = bayesian_pressure(HIGH)["score"]
        lo = bayesian_pressure(LOW)["score"]
        assert 0.0 <= lo <= hi <= 1.0

    def test_knn_order(self):
        assert knn_pressure(HIGH)["score"] > knn_pressure(LOW)["score"]
        assert knn_pressure(HIGH)["neighbors"] >= 1

    def test_neural_range_and_order(self):
        hi = neural_pressure(HIGH)["score"]
        lo = neural_pressure(LOW)["score"]
        assert 0.0 <= lo <= 1.0 and 0.0 <= hi <= 1.0
        assert hi > lo

    def test_ensemble_bounds(self):
        assert 0.0 <= ensemble_occupancy(HIGH) <= 1.0
        assert ensemble_occupancy(HIGH) > ensemble_occupancy(LOW)


class TestSearch:
    def test_best_arrival_prefers_lower_occupancy(self):
        # Occupancy that decreases as the day's pressure falls.
        res = best_arrival_search(
            dict(HIGH), lambda f: f["timePressure"], start_hour=20, start_day=6)
        assert "bestSlotMinutesAhead" in res
        assert 0.0 <= res["bestOccupancy"] <= 1.0
        assert len(res["slots"]) >= 1


class TestCapacity:
    def test_live_capacity_from_parking(self):
        parking = [
            {"name": "Central Garage", "type": "parking", "lat": 1, "lng": 2},
            {"name": "Side Street", "type": "parking", "lat": 1, "lng": 2},
        ]
        cap = estimate_parking_capacity(parking, [])
        assert cap["source"] == "live"
        assert cap["totalCapacity"] > 0
        assert len(cap["lots"]) == 2
        # Garage should be inferred as the larger facility.
        garage = next(l for l in cap["lots"] if "Garage" in l["name"])
        assert garage["type"] == "garage"

    def test_estimated_capacity_without_parking(self):
        cap = estimate_parking_capacity([], [{"type": "cafe"}] * 5)
        assert cap["source"] == "estimated"
        assert cap["totalCapacity"] >= 20


class TestEngineEndToEnd:
    def test_predict_busy_scenario(self):
        places = [{"type": "shopping_mall", "open": True, "rating": 4.3,
                   "reviewCount": 4000, "lat": 19.07, "lng": 72.87}] * 8
        parking = [{"name": "Mall Garage", "type": "parking", "lat": 19.07, "lng": 72.87}]
        r = predict_occupancy(places, {"precipitationProb": 0.4, "aqi": 120},
                              {"distanceMeters": 1200}, parking, hour=19, day=6, ready_signals=9)
        assert r["estimatedAvailable"] <= r["estimatedCapacity"]
        assert r["verdict"] in ("Moderate", "Hard", "Very hard")
        assert r["aiOpinion"]["reasons"]
        assert r["modelBreakdown"]["decisionPath"]

    def test_predict_quiet_scenario(self):
        r = predict_occupancy([], {}, {}, [], hour=4, day=2, ready_signals=0)
        assert r["capacitySource"] == "estimated"
        assert r["verdict"] in ("Easy", "Moderate")
        assert 0 <= r["occupancyProbabilityPct"] <= 100

    def test_build_features_bounds(self):
        f = build_features([], {}, {}, {"totalCapacity": 100}, 12, 3)
        for k in ("demand", "timePressure", "environment", "route", "supplyTightness"):
            assert 0.0 <= f[k] <= 1.0
