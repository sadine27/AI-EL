"""
Tests for geolocation.py — Geocoding, Time Zone, and Elevation collectors.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestFetchGeocoding:
    """Test Geocoding API collector edge cases."""

    @patch("httpx.AsyncClient")
    def test_successful_fetch(self, mock_client):
        """Successful fetch should return geocoding data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={
            "status": "OK",
            "results": [{"formatted_address": "Mumbai, India"}]
        })
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.geolocation import fetch_geocoding
        import asyncio
        result = asyncio.run(fetch_geocoding({"lat": 19.0, "lng": 72.0}, "test-key"))
        assert result["status"] == "OK"

    @patch("httpx.AsyncClient")
    def test_zero_results(self, mock_client):
        """ZERO_RESULTS should return empty data, not error."""
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={
            "status": "ZERO_RESULTS"
        })
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.geolocation import fetch_geocoding
        import asyncio
        result = asyncio.run(fetch_geocoding({"lat": 0.0, "lng": 0.0}, "test-key"))
        assert result["status"] == "ZERO_RESULTS"

    @patch("httpx.AsyncClient")
    def test_request_denied(self, mock_client):
        """REQUEST_DENIED should raise exception."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={"status": "REQUEST_DENIED"})
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.geolocation import fetch_geocoding
        import asyncio
        with pytest.raises(Exception, match="denied"):
            asyncio.run(fetch_geocoding({"lat": 19.0, "lng": 72.0}, "test-key"))

    def test_invalid_center(self):
        """Missing keys in center should raise ValueError."""
        from collectors.geolocation import fetch_geocoding
        import asyncio
        with pytest.raises(ValueError):
            asyncio.run(fetch_geocoding({}, "test-key"))


class TestFetchTimezone:
    """Test Time Zone API collector edge cases."""

    @patch("httpx.AsyncClient")
    def test_successful_fetch(self, mock_client):
        """Successful fetch should return timezone data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={
            "status": "OK",
            "timeZoneId": "Asia/Kolkata"
        })
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.geolocation import fetch_timezone
        import asyncio
        result = asyncio.run(fetch_timezone({"lat": 19.0, "lng": 72.0}, "test-key"))
        assert result["status"] == "OK"

    def test_invalid_center(self):
        """Missing lat should raise ValueError."""
        from collectors.geolocation import fetch_timezone
        import asyncio
        with pytest.raises(ValueError):
            asyncio.run(fetch_timezone({"lng": 72.0}, "test-key"))


class TestFetchElevation:
    """Test Elevation API collector edge cases."""

    @patch("httpx.AsyncClient")
    def test_successful_fetch(self, mock_client):
        """Successful fetch should return elevation data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={
            "status": "OK",
            "results": [{"elevation": 10.0}]
        })
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.geolocation import fetch_elevation
        import asyncio
        result = asyncio.run(fetch_elevation({"lat": 19.0, "lng": 72.0}, "test-key"))
        assert result["status"] == "OK"
