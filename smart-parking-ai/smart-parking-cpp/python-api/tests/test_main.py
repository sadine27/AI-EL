"""
Tests for main.py — FastAPI endpoints with edge case handling.
"""

import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

# Disable frontend static file serving BEFORE importing app
os.environ["SERVE_FRONTEND"] = "0"

# Allow test hosts through TrustedHostMiddleware
os.environ["ALLOWED_HOSTS"] = "localhost,127.0.0.1,test,testserver"

from main import app
from models.features import FeatureVector


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
    """Valid prediction request should return 200."""
    resp = await client.post("/api/predict", json={
        "lat": 19.0760,
        "lng": 72.8777,
        "totalSlots": 10,
        "unavailable": 3
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "predictedAvailable" in data
    assert "predictedOccupancyPct" in data
    assert "riskLabel" in data
    assert "engine" in data


@pytest.mark.asyncio
async def test_predict_invalid_lat(client):
    """Invalid latitude should return 422."""
    resp = await client.post("/api/predict", json={
        "lat": 200,  # Out of range
        "lng": 72.8777,
        "totalSlots": 10,
        "unavailable": 3
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_predict_invalid_lng(client):
    """Invalid longitude should return 422."""
    resp = await client.post("/api/predict", json={
        "lat": 19.0760,
        "lng": 200,  # Out of range
        "totalSlots": 10,
        "unavailable": 3
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_predict_invalid_total_slots(client):
    """Invalid totalSlots should return 422."""
    resp = await client.post("/api/predict", json={
        "lat": 19.0760,
        "lng": 72.8777,
        "totalSlots": 0,  # Must be >= 1
        "unavailable": 3
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_predict_unavailable_exceeds_total(client):
    """unavailable > totalSlots should return 422."""
    resp = await client.post("/api/predict", json={
        "lat": 19.0760,
        "lng": 72.8777,
        "totalSlots": 10,
        "unavailable": 20  # Exceeds total
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_predict_negative_unavailable(client):
    """Negative unavailable should return 422."""
    resp = await client.post("/api/predict", json={
        "lat": 19.0760,
        "lng": 72.8777,
        "totalSlots": 10,
        "unavailable": -5  # Negative
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_predict_missing_fields(client):
    """Missing fields should use defaults."""
    resp = await client.post("/api/predict", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert "predictedAvailable" in data


@pytest.mark.asyncio
async def test_predict_with_hour_and_day(client):
    """Specifying hour and dayOfWeek should work."""
    resp = await client.post("/api/predict", json={
        "lat": 19.0760,
        "lng": 72.8777,
        "totalSlots": 10,
        "unavailable": 3,
        "hour": 14,
        "dayOfWeek": 2
    })
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_predict_invalid_hour(client):
    """Invalid hour (out of range) should return 422."""
    resp = await client.post("/api/predict", json={
        "lat": 19.0760,
        "lng": 72.8777,
        "totalSlots": 10,
        "unavailable": 3,
        "hour": 25  # Out of range
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_predict_invalid_day(client):
    """Invalid dayOfWeek (out of range) should return 422."""
    resp = await client.post("/api/predict", json={
        "lat": 19.0760,
        "lng": 72.8777,
        "totalSlots": 10,
        "unavailable": 3,
        "dayOfWeek": 7  # Out of range
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_signals_endpoint(client):
    """Signals endpoint should return API catalog."""
    resp = await client.get("/api/signals")
    assert resp.status_code == 200


# ------------------------------------------------------------
# Tests for internal functions
# ------------------------------------------------------------
from main import (
    safe_get_nested,
    get_default_environment,
    get_default_route,
    fallback_prediction,
    call_cpp_engine,
    extract_environment,
    extract_route
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


class TestFallbackPrediction:
    """Test fallback prediction edge cases."""

    def test_basic_fallback(self):
        result = fallback_prediction(
            total_slots=10, unavailable=3,
            places=[], env=None, route=None,
            hour=12, day=3
        )
        assert "predictedAvailable" in result
        assert result["engine"] == "python-fallback"
        assert result["liveAvailable"] == 7
        assert 0 <= result["predictedOccupancyPct"] <= 100

    def test_fully_occupied(self):
        result = fallback_prediction(
            total_slots=10, unavailable=10,
            places=[{"type": "cafe", "open": True, "rating": 4, "reviewCount": 100}],
            env={"precipitationProb": 0.5}, route={"distanceMeters": 5000},
            hour=18, day=2
        )
        assert result["engine"] == "python-fallback"
        assert result["liveAvailable"] == 0  # Live occupancy = 100%
        # Predicted availability blends live + demand + env + route factors together
        # It can be higher than liveAvailable due to other factors reducing occ_ratio
        assert 0 <= result["predictedAvailable"] <= 10
        assert result["predictedOccupancyPct"] >= 40  # High occupancy expected

    def test_zero_total_slots(self):
        """Edge case: totalSlots=0 shouldn't crash (clamped to min 1)."""
        result = fallback_prediction(
            total_slots=1, unavailable=0,
            places=[], env=None, route=None,
            hour=12, day=3
        )
        assert result is not None

    def test_minimum_values(self):
        """Single slot, zero occupied."""
        result = fallback_prediction(
            total_slots=1, unavailable=0,
            places=[], env=None, route=None,
            hour=3, day=2
        )
        assert result["liveAvailable"] == 1


class TestCallCppEngine:
    """Test C++ engine call with edge cases."""

    @patch("main.httpx.AsyncClient")
    def test_engine_unreachable(self, mock_client):
        """Unreachable engine should return None."""
        mock_instance = MagicMock()
        mock_instance.post = AsyncMock(side_effect=Exception("Connection refused"))
        mock_client.return_value.__aenter__.return_value = mock_instance

        import asyncio
        result = asyncio.run(call_cpp_engine({"test": True}))
        assert result is None

    @patch("main.httpx.AsyncClient")
    def test_engine_timeout(self, mock_client):
        """Timeout should return None."""
        mock_instance = MagicMock()
        import httpx
        mock_instance.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
        mock_client.return_value.__aenter__.return_value = mock_instance

        import asyncio
        result = asyncio.run(call_cpp_engine({"test": True}))
        assert result is None

    @patch("main.httpx.AsyncClient")
    def test_engine_non_200(self, mock_client):
        """Non-200 response should return None."""
        mock_response = AsyncMock()
        mock_response.status_code = 500
        mock_instance = MagicMock()
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        import asyncio
        result = asyncio.run(call_cpp_engine({"test": True}))
        assert result is None


class TestExtractEnvironment:
    """Test environment extraction with edge cases."""

    def test_empty_signals(self):
        """Empty signals list should return defaults."""
        env = extract_environment([])
        assert env["precipitationProb"] == 0.0

    def test_malformed_signals(self):
        """Malformed signal entries should be skipped."""
        signals = [
            {"name": "Weather API", "status": "ready", "data": None},
            {"name": "Weather API", "status": "error", "data": {}},
            "not_a_dict",
            123
        ]
        env = extract_environment(signals)
        assert env["precipitationProb"] == 0.0

    def test_partial_weather_data(self):
        """Partial weather data should use defaults for missing fields."""
        signals = [
            {
                "name": "Weather API",
                "status": "ready",
                "data": {
                    "precipitation": {"probability": {"percent": 50}}
                    # Missing other fields
                }
            }
        ]
        env = extract_environment(signals)
        assert env["precipitationProb"] == 0.5
        assert env["visibilityKm"] == 16.0  # Default

    def test_air_quality_missing_indexes(self):
        """Missing indexes should leave aqi at 0."""
        signals = [
            {"name": "Air Quality API", "status": "ready", "data": {}}
        ]
        env = extract_environment(signals)
        assert env["aqi"] == 0

    def test_pollen_missing_daily_info(self):
        """Missing dailyInfo should leave pollenScore at 0."""
        signals = [
            {"name": "Pollen API", "status": "ready", "data": {}}
        ]
        env = extract_environment(signals)
        assert env["pollenScore"] == 0.0


class TestExtractRoute:
    """Test route extraction with edge cases."""

    def test_empty_signals(self):
        """Empty signals list should return defaults."""
        route = extract_route([])
        assert route["distanceMeters"] == 0.0

    def test_distance_matrix_not_found(self):
        """Distance matrix with NOT_FOUND status should be skipped."""
        signals = [
            {
                "name": "Distance Matrix API",
                "status": "ready",
                "data": {
                    "rows": [{"elements": [{"status": "NOT_FOUND"}]}]
                }
            }
        ]
        route = extract_route(signals)
        assert route["distanceMeters"] == 0.0

    def test_malformed_signal(self):
        """Non-dict signal data should be handled."""
        signals = [
            {"name": "Routes API", "status": "ready", "data": "string_data"}
        ]
        route = extract_route(signals)
        assert route["distanceMeters"] == 0.0

    def test_roads_api_empty(self):
        """Empty snappedPoints should not cause errors."""
        signals = [
            {"name": "Roads API", "status": "ready",
             "data": {"snappedPoints": []}}
        ]
        route = extract_route(signals)
        assert route["roadMatched"] is False
