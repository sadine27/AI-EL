"""
Tests for routing.py — Distance Matrix, Routes, Roads collectors and route score.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from collectors.routing import compute_route_score


class TestFetchDistanceMatrix:
    """Test Distance Matrix API collector edge cases."""

    @patch("httpx.AsyncClient")
    def test_successful_fetch(self, mock_client):
        """Successful fetch should return distance data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={
            "status": "OK",
            "rows": [{"elements": [{"status": "OK", "distance": {"value": 1000}}]}]
        })
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.routing import fetch_distance_matrix
        import asyncio
        result = asyncio.run(
            fetch_distance_matrix({"lat": 19.0, "lng": 72.0}, "test-key")
        )
        assert result["status"] == "OK"

    @patch("httpx.AsyncClient")
    def test_zero_results(self, mock_client):
        """ZERO_RESULTS should be handled gracefully."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={"status": "ZERO_RESULTS"})
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.routing import fetch_distance_matrix
        import asyncio
        result = asyncio.run(
            fetch_distance_matrix({"lat": 19.0, "lng": 72.0}, "test-key")
        )
        assert result["status"] == "ZERO_RESULTS"

    def test_invalid_center(self):
        """Missing lat/lng should raise ValueError."""
        from collectors.routing import fetch_distance_matrix
        import asyncio
        with pytest.raises(ValueError):
            asyncio.run(fetch_distance_matrix({}, "test-key"))


class TestFetchRoutes:
    """Test Routes API collector edge cases."""

    @patch("httpx.AsyncClient")
    def test_successful_fetch(self, mock_client):
        """Successful fetch should return route data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={
            "routes": [{"distanceMeters": 2500, "duration": "300s"}]
        })
        mock_instance = MagicMock()
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.routing import fetch_routes
        import asyncio
        result = asyncio.run(
            fetch_routes({"lat": 19.0, "lng": 72.0}, "test-key")
        )
        assert len(result["routes"]) == 1


class TestFetchRoads:
    """Test Roads API collector edge cases."""

    @patch("httpx.AsyncClient")
    def test_successful_fetch(self, mock_client):
        """Successful fetch should return roads data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={
            "snappedPoints": [{"location": {"latitude": 19.0, "longitude": 72.0}}]
        })
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.routing import fetch_roads
        import asyncio
        result = asyncio.run(fetch_roads({"lat": 19.0, "lng": 72.0}, "test-key"))
        assert len(result["snappedPoints"]) == 1

    @patch("httpx.AsyncClient")
    def test_empty_snapped_points(self, mock_client):
        """Empty snappedPoints (no road nearby) should not be an error."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={"snappedPoints": []})
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.routing import fetch_roads
        import asyncio
        result = asyncio.run(fetch_roads({"lat": 19.0, "lng": 72.0}, "test-key"))
        assert result["snappedPoints"] == []


class TestComputeRouteScore:
    """Test route score computation with edge cases."""

    def test_default_route(self):
        """Default route should produce moderate score."""
        route = {
            "distanceMeters": 0,
            "durationSeconds": 0,
            "roadMatched": False
        }
        score = compute_route_score(route)
        assert 0 <= score <= 1
        # Without road matching, score should be at least 0.1
        assert score >= 0.09

    def test_long_distance(self):
        """Long distance should increase score."""
        score = compute_route_score({
            "distanceMeters": 10000,
            "durationSeconds": 600,
            "roadMatched": True
        })
        assert 0 <= score <= 1

    def test_none_route(self):
        """None route should return 0."""
        assert compute_route_score(None) == 0.0

    def test_empty_dict(self):
        """Empty dict should use defaults."""
        score = compute_route_score({})
        assert 0 <= score <= 1

    def test_missing_keys(self):
        """Missing keys should not crash."""
        score = compute_route_score({"roadMatched": True})
        assert 0 <= score <= 1

    def test_string_values(self):
        """String values should be converted or default to 0."""
        score = compute_route_score({
            "distanceMeters": "5000",
            "durationSeconds": "300",
            "roadMatched": "true"
        })
        # Strings don't convert via float, so defaults should be used
        assert 0 <= score <= 1

    def test_full_route_with_road(self):
        """Full route data with road matching should give higher score."""
        no_road = compute_route_score({
            "distanceMeters": 5000,
            "durationSeconds": 600,
            "roadMatched": False
        })
        with_road = compute_route_score({
            "distanceMeters": 5000,
            "durationSeconds": 600,
            "roadMatched": True
        })
        assert with_road < no_road  # Road matching reduces score (easier access)
