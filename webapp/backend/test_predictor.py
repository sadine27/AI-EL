"""
Tests for the standalone webapp's prediction contract.

These guard the exact request/response shape that webapp/frontend/index.html
depends on, so the frontend and backend can never silently drift apart again.
app.py is exercised through FastAPI's TestClient (no MySQL required); app_db.py
shares the same predictor module so it's covered transitively.
"""

import math

import pytest
from fastapi.testclient import TestClient

import app
from predictor import PredictionInput, predict

client = TestClient(app.app)

# The browser form posts snake_case field names.
FRONTEND_PAYLOAD = {
    "latitude": 19.076,
    "longitude": 72.8777,
    "total_slots": 100,
    "unavailable_slots": 40,
    "hour": 18,
    "day_of_week": 5,
}


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


def test_lots_seeded():
    r = client.get("/api/lots")
    assert r.status_code == 200
    lots = r.json()
    assert isinstance(lots, list) and len(lots) == 5
    assert {"id", "name", "lat", "lng", "total_slots"} <= set(lots[0])


def test_predict_accepts_frontend_snake_case():
    r = client.post("/api/predict", json=FRONTEND_PAYLOAD)
    assert r.status_code == 200


def test_predict_response_matches_frontend_contract():
    body = client.post("/api/predict", json=FRONTEND_PAYLOAD).json()
    # Field names the frontend's renderResult() reads.
    assert isinstance(body["predictedAvailable"], int)
    assert isinstance(body["occupancyPercent"], (int, float))
    assert isinstance(body["confidencePercent"], (int, float))
    assert body["riskLabel"] in {"low", "medium", "high"}
    # modelBreakdown MUST be an array of {modelName, prediction, confidence}.
    mb = body["modelBreakdown"]
    assert isinstance(mb, list) and len(mb) >= 1
    for item in mb:
        assert set(item) == {"modelName", "prediction", "confidence"}
        assert isinstance(item["confidence"], (int, float))


def test_predict_accepts_camel_case_aliases():
    payload = {"lat": 19.0, "lng": 72.0, "totalSlots": 10,
               "unavailable": 3, "hour": 12, "dayOfWeek": 2}
    assert client.post("/api/predict", json=payload).status_code == 200


def test_unavailable_is_clamped_to_capacity():
    body = client.post("/api/predict", json={**FRONTEND_PAYLOAD,
                                             "total_slots": 10,
                                             "unavailable_slots": 999}).json()
    assert body["predictedAvailable"] == 0
    assert body["occupancyPercent"] == 100.0


def test_out_of_range_rejected():
    bad = {**FRONTEND_PAYLOAD, "latitude": 200}
    assert client.post("/api/predict", json=bad).status_code == 422


def test_occupancy_drives_higher_risk():
    low = predict(PredictionInput(lat=1, lng=1, totalSlots=100,
                                  unavailable=5, hour=3, dayOfWeek=2))
    high = predict(PredictionInput(lat=1, lng=1, totalSlots=100,
                                   unavailable=95, hour=18, dayOfWeek=2))
    assert high.occupancyPercent > low.occupancyPercent


@pytest.mark.parametrize("hour", [3, 12, 18, 23])
@pytest.mark.parametrize("occupied", [5, 40, 80, 95])
def test_predicted_available_never_exceeds_live_free(hour, occupied):
    # The forecast may be more pessimistic than the live count, never more
    # optimistic: predictedAvailable <= total - unavailable, always.
    out = predict(PredictionInput(lat=19.0, lng=72.0, totalSlots=100,
                                  unavailable=occupied, hour=hour, dayOfWeek=3))
    assert out.predictedAvailable <= 100 - occupied
    assert out.predictedAvailable >= 0


@pytest.mark.parametrize("bad_value", [math.inf, math.nan, -math.inf])
def test_non_finite_numbers_rejected(bad_value):
    # JSON technically can't carry inf/nan, but guard the model anyway.
    with pytest.raises(Exception):
        PredictionInput(lat=1, lng=1, totalSlots=10,
                        unavailable=int(bad_value) if bad_value == bad_value else 0,
                        hour=bad_value, dayOfWeek=2)
