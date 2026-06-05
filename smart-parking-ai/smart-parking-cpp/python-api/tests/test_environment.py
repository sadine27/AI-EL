"""
Tests for environment.py — Air Quality, Pollen collectors and environment score.
"""

import pytest
import math
from unittest.mock import AsyncMock, MagicMock, patch
from collectors.environment import (
    fetch_air_quality,
    fetch_pollen,
    compute_environment_score
)


class TestFetchAirQuality:
    """Test Air Quality API collector edge cases."""

    @patch("httpx.AsyncClient")
    def test_successful_fetch(self, mock_client):
        """Successful fetch should return AQI data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={"indexes": [{"aqi": 50}]})
        mock_instance = MagicMock()
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        import asyncio
        result = asyncio.run(fetch_air_quality({"lat": 19.0, "lng": 72.0}, "test-key"))
        assert result["indexes"][0]["aqi"] == 50

    @patch("httpx.AsyncClient")
    def test_non_dict_response(self, mock_client):
        """Non-dict response should raise exception."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value="not a dict")
        mock_instance = MagicMock()
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        import asyncio
        with pytest.raises(Exception, match="non-dict"):
            asyncio.run(fetch_air_quality({"lat": 19.0, "lng": 72.0}, "test-key"))

    def test_invalid_center(self):
        """Missing keys in center should raise ValueError."""
        import asyncio
        with pytest.raises(ValueError):
            asyncio.run(fetch_air_quality({}, "test-key"))


class TestFetchPollen:
    """Test Pollen API collector edge cases."""

    @patch("httpx.AsyncClient")
    def test_successful_fetch(self, mock_client):
        """Successful fetch should return pollen data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={"dailyInfo": []})
        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        import asyncio
        result = asyncio.run(fetch_pollen({"lat": 19.0, "lng": 72.0}, "test-key"))
        assert "dailyInfo" in result


class TestComputeEnvironmentScore:
    """Test environment score with edge cases."""

    def test_default_env(self):
        """Default environment should produce low score."""
        env = {
            "precipitationProb": 0.0,
            "thunderstormProb": 0.0,
            "visibilityKm": 16.0,
            "cloudCover": 0.0,
            "windSpeed": 0.0,
            "aqi": 0.0,
            "pollenScore": 0.0
        }
        score = compute_environment_score(env)
        assert 0 <= score <= 1
        assert score < 0.3  # Should be relatively low

    def test_bad_weather(self):
        """Bad weather should produce higher score."""
        env = {
            "precipitationProb": 0.9,
            "thunderstormProb": 0.8,
            "visibilityKm": 1.0,
            "cloudCover": 1.0,
            "windSpeed": 40.0,
            "aqi": 0,
            "pollenScore": 0.0
        }
        score = compute_environment_score(env)
        assert 0 <= score <= 1
        assert score > 0.3  # Should be higher than default

    def test_missing_keys(self):
        """Missing keys should use defaults and not crash."""
        score = compute_environment_score({})
        assert 0 <= score <= 1

    def test_nan_values(self):
        """NaN values should be handled gracefully."""
        env = {
            "precipitationProb": float('nan'),
            "thunderstormProb": float('nan'),
            "visibilityKm": float('nan'),
            "cloudCover": float('nan'),
            "windSpeed": float('nan'),
            "aqi": float('nan'),
            "pollenScore": float('nan')
        }
        score = compute_environment_score(env)
        assert 0 <= score <= 1
        assert not math.isnan(score)

    def test_inf_values(self):
        """Infinity values should be handled gracefully."""
        env = {
            "precipitationProb": float('inf'),
            "thunderstormProb": float('inf'),
            "visibilityKm": float('-inf'),
            "cloudCover": float('inf'),
            "windSpeed": 999999,
            "aqi": 999999,
            "pollenScore": 999999
        }
        score = compute_environment_score(env)
        assert 0 <= score <= 1

    def test_none_values(self):
        """None values should be treated as 0."""
        env = {
            "precipitationProb": None,
            "thunderstormProb": None,
            "visibilityKm": None,
            "cloudCover": None,
            "windSpeed": None,
            "aqi": None,
            "pollenScore": None
        }
        score = compute_environment_score(env)
        assert 0 <= score <= 1

    def test_string_values(self):
        """String values that can't be converted should be handled."""
        env = {
            "precipitationProb": "invalid",
            "aqi": "invalid_string",
        }
        score = compute_environment_score(env)
        assert 0 <= score <= 1
