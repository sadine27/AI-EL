"""
Tests for weather.py — Weather API collector.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestFetchWeather:
    """Test weather API collector edge cases."""

    @patch("httpx.AsyncClient")
    def test_successful_fetch(self, mock_client):
        """Successful fetch should return weather data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={
            "precipitation": {"probability": {"percent": 30}},
            "temperature": {"value": 28}
        })
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.weather import fetch_weather
        import asyncio
        result = asyncio.run(fetch_weather({"lat": 19.0, "lng": 72.0}, "test-key"))
        assert "precipitation" in result
        assert result["precipitation"]["probability"]["percent"] == 30

    @patch("httpx.AsyncClient")
    def test_api_error_raises_exception(self, mock_client):
        """HTTP error should raise exception."""
        mock_response = AsyncMock()
        mock_response.status_code = 403
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        from collectors.weather import fetch_weather
        import asyncio
        with pytest.raises(Exception, match="HTTP 403"):
            asyncio.run(fetch_weather({"lat": 19.0, "lng": 72.0}, "test-key"))

    def test_invalid_center(self):
        """Invalid center should raise ValueError."""
        from collectors.weather import fetch_weather
        import asyncio
        with pytest.raises(ValueError):
            asyncio.run(fetch_weather(None, "test-key"))
