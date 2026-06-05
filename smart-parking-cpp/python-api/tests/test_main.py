"""
Tests for main.py — FastAPI endpoints with the location-only prediction contract.
"""

import os
import pytest
from httpx import AsyncClient, ASGITransport

# Disable frontend static file serving BEFORE importing app
os.environ["SERVE_FRONTEND"] = "0"

# Allow test hosts through TrustedHostMiddleware
os.environ["ALLOWED_HOSTS"] = "localhost,127.0.0.1,test,testserver"

from main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app (SERVE_FRONTEND already disabled)."""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_health_endpoint(client):
    """Health check should return status ok."""
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data


@pytest.mark.asyncio
async def test_predict_valid_input(client):
    """Valid location-only prediction request should return the new contract."""
    resp = await client.post("/api/predict", json={"lat": 19.0760, "lng": 72.8777})
    assert resp.status_code == 200
    data = resp.json()
    for key in ("occupancyProbabilityPct", "estimatedAvailable", "estimatedCapacity",
                "riskLabel", "verdict", "aiOpinion", "modelBreakdown", "engine"):
        assert key in data
    assert 0 <= data["occupancyProbabilityPct"] <= 100
    assert data["estimatedAvailable"] <= data["estimatedCapacity"]
    assert "headline" in data["aiOpinion"]
    assert isinstance(data["aiOpinion"]["reasons"], list)


@pytest.mark.asyncio
async def test_predict_invalid_lat(client):
    """Invalid latitude should return 422."""
    resp = await client.post("/api/predict", json={"lat": 200, "lng": 72.8777})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_predict_invalid_lng(client):
    """Invalid longitude should return 422."""
    resp = await client.post("/api/predict", json={"lat": 19.0760, "lng": 200})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_predict_missing_fields(client):
    """Missing fields should use defaults and still return a result."""
    resp = await client.post("/api/predict", json={})
    assert resp.status_code == 200
    assert "estimatedAvailable" in resp.json()


@pytest.mark.asyncio
async def test_predict_with_hour_and_day(client):
    """Specifying hour and dayOfWeek should work."""
    resp = await client.post("/api/predict", json={
        "lat": 19.0760, "lng": 72.8777, "hour": 14, "dayOfWeek": 2
    })
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_predict_invalid_hour(client):
    """Invalid hour (out of range) should return 422."""
    resp = await client.post("/api/predict", json={
        "lat": 19.0760, "lng": 72.8777, "hour": 25
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_predict_invalid_day(client):
    """Invalid dayOfWeek (out of range) should return 422."""
    resp = await client.post("/api/predict", json={
        "lat": 19.0760, "lng": 72.8777, "dayOfWeek": 7
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_predict_busy_vs_quiet(client):
    """A weekend peak hour should not predict less occupancy than a quiet night."""
    busy = await client.post("/api/predict", json={
        "lat": 19.0760, "lng": 72.8777, "hour": 19, "dayOfWeek": 6})
    quiet = await client.post("/api/predict", json={
        "lat": 19.0760, "lng": 72.8777, "hour": 4, "dayOfWeek": 2})
    assert busy.status_code == 200 and quiet.status_code == 200
    assert busy.json()["occupancyProbabilityPct"] >= quiet.json()["occupancyProbabilityPct"]


@pytest.mark.asyncio
async def test_signals_endpoint(client):
    """Signals endpoint should return API catalog."""
    resp = await client.get("/api/signals")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_geocode_empty_address(client):
    """Empty address should return 400 without making network calls."""
    resp = await client.get("/api/geocode", params={"address": "   "})
    assert resp.status_code == 400


# ------------------------------------------------------------
# Tests for internal helper functions
# ------------------------------------------------------------
from main import (
    safe_get_nested,
    get_default_environment,
    get_default_route,
    extract_environment,
    extract_route,
)


class TestSafeGetNested:
    """Test the safe nested dict accessor."""

    def test_simple_key(self):
        assert safe_get_nested({"a": 1}, "a") == 1

    def test_nested_key(self):
        assert safe_get_nested({"a": {"b": 2}}, "a", "b") == 2

    def test_missing_key(self):
        assert safe_get_nested({"a": 1}, "b") == 0.0

    def test_deep_missing(self):
        assert safe_get_nested({"a": {"b": 2}}, "a", "c", "d") == 0.0

    def test_custom_default(self):
        assert safe_get_nested({"a": 1}, "b", default=None) is None

    def test_none_value(self):
        assert safe_get_nested({"a": None}, "a") == 0.0

    def test_non_dict_middle(self):
        assert safe_get_nested({"a": "string"}, "a", "b") == 0.0


class TestDefaultEnvironment:
    """Test default environment values."""

    def test_defaults(self):
        env = get_default_environment()
        assert env["precipitationProb"] == 0.0
        assert env["visibilityKm"] == 16.0
        assert env["aqi"] == 0


class TestDefaultRoute:
    """Test default route values."""

    def test_defaults(self):
        route = get_default_route()
        assert route["distanceMeters"] == 0.0
        assert route["durationSeconds"] == 0.0
        assert route["roadMatched"] is False


class TestExtractEnvironment:
    """Test environment extraction with edge cases."""

    def test_empty_signals(self):
        env = extract_environment([])
        assert env["precipitationProb"] == 0.0

    def test_malformed_signals(self):
        signals = [
            {"name": "Weather API", "status": "ready", "data": None},
            {"name": "Weather API", "status": "error", "data": {}},
            "not_a_dict",
            123,
        ]
        env = extract_environment(signals)
        assert env["precipitationProb"] == 0.0

    def test_partial_weather_data(self):
        signals = [{
            "name": "Weather API", "status": "ready",
            "data": {"precipitation": {"probability": {"percent": 50}}},
        }]
        env = extract_environment(signals)
        assert env["precipitationProb"] == 0.5
        assert env["visibilityKm"] == 16.0

    def test_air_quality_missing_indexes(self):
        signals = [{"name": "Air Quality API", "status": "ready", "data": {}}]
        env = extract_environment(signals)
        assert env["aqi"] == 0

    def test_pollen_missing_daily_info(self):
        signals = [{"name": "Pollen API", "status": "ready", "data": {}}]
        env = extract_environment(signals)
        assert env["pollenScore"] == 0.0


class TestExtractRoute:
    """Test route extraction with edge cases."""

    def test_empty_signals(self):
        route = extract_route([])
        assert route["distanceMeters"] == 0.0

    def test_distance_matrix_not_found(self):
        signals = [{
            "name": "Distance Matrix API", "status": "ready",
            "data": {"rows": [{"elements": [{"status": "NOT_FOUND"}]}]},
        }]
        route = extract_route(signals)
        assert route["distanceMeters"] == 0.0

    def test_malformed_signal(self):
        signals = [{"name": "Routes API", "status": "ready", "data": "string_data"}]
        route = extract_route(signals)
        assert route["distanceMeters"] == 0.0

    def test_roads_api_empty(self):
        signals = [{"name": "Roads API", "status": "ready", "data": {"snappedPoints": []}}]
        route = extract_route(signals)
        assert route["roadMatched"] is False
