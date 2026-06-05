"""
Shared fixtures and mocks for Smart Parking AI test suite.
"""

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch


# ------------------------------------------------------------
# Sample test data
# ------------------------------------------------------------
SAMPLE_PLACES = [
    {"name": "Cafe Mumbai", "type": "cafe", "open": True,
     "rating": 4.2, "reviewCount": 150, "lat": 19.076, "lng": 72.877},
    {"name": "Mall Central", "type": "shopping_mall", "open": True,
     "rating": 4.0, "reviewCount": 300, "lat": 19.078, "lng": 72.879},
]

SAMPLE_WEATHER_RESPONSE = {
    "precipitation": {"probability": {"percent": 30}},
    "thunderstormProbability": 10,
    "visibility": {"distance": {"value": 10.0}},
    "cloudCover": 50,
    "wind": {"speed": {"value": 12.5}}
}

SAMPLE_AIR_QUALITY_RESPONSE = {
    "indexes": [{"aqi": 85}]
}

SAMPLE_POLLEN_RESPONSE = {
    "dailyInfo": [{
        "pollenTypeInfo": [
            {"indexInfo": {"value": 3}},
            {"indexInfo": {"value": 1}}
        ]
    }]
}

SAMPLE_GEOCODING_RESPONSE = {
    "status": "OK",
    "results": [{"formatted_address": "Mumbai, India"}]
}

SAMPLE_TIMEZONE_RESPONSE = {
    "status": "OK",
    "timeZoneId": "Asia/Kolkata",
    "timeZoneName": "India Standard Time"
}

SAMPLE_ELEVATION_RESPONSE = {
    "status": "OK",
    "results": [{"elevation": 10.0}]
}

SAMPLE_DISTANCE_MATRIX_RESPONSE = {
    "status": "OK",
    "rows": [{
        "elements": [{
            "status": "OK",
            "distance": {"value": 2500},
            "duration_in_traffic": {"value": 300}
        }]
    }]
}

SAMPLE_ROUTES_RESPONSE = {
    "routes": [{"distanceMeters": 2500, "duration": "300s"}]
}

SAMPLE_ROADS_RESPONSE = {
    "snappedPoints": [{"location": {"latitude": 19.076, "longitude": 72.877}}]
}


# ------------------------------------------------------------
# Async HTTP client mock helper
# ------------------------------------------------------------
def mock_async_response(status_code: int, json_data: dict):
    """Create a mock async HTTP response.
    Note: httpx.response.json() is SYNCHRONOUS, not async.
    """
    mock = AsyncMock()
    mock.status_code = status_code
    mock.json = MagicMock(return_value=json_data)
    return mock


# ------------------------------------------------------------
# Mock the httpx.AsyncClient context manager
# ------------------------------------------------------------
@pytest.fixture
def mock_httpx_client():
    """Fixture that patches httpx.AsyncClient to return controlled responses."""
    with patch("httpx.AsyncClient") as mock:
        # Default: return OK responses for all API calls
        async def get_side_effect(url, **kwargs):
            if "geocode" in url:
                return mock_async_response(200, SAMPLE_GEOCODING_RESPONSE)
            elif "timezone" in url:
                return mock_async_response(200, SAMPLE_TIMEZONE_RESPONSE)
            elif "elevation" in url:
                return mock_async_response(200, SAMPLE_ELEVATION_RESPONSE)
            elif "distancematrix" in url:
                return mock_async_response(200, SAMPLE_DISTANCE_MATRIX_RESPONSE)
            elif "roads" in url:
                return mock_async_response(200, SAMPLE_ROADS_RESPONSE)
            elif "weather" in url:
                return mock_async_response(200, SAMPLE_WEATHER_RESPONSE)
            elif "pollen" in url:
                return mock_async_response(200, SAMPLE_POLLEN_RESPONSE)
            return mock_async_response(200, {})

        async def post_side_effect(url, **kwargs):
            if "places.googleapis" in url:
                return mock_async_response(200, {"places": SAMPLE_PLACES})
            elif "airquality" in url:
                return mock_async_response(200, SAMPLE_AIR_QUALITY_RESPONSE)
            elif "routes" in url:
                return mock_async_response(200, SAMPLE_ROUTES_RESPONSE)
            return mock_async_response(200, {})

        mock_instance = MagicMock()
        mock_instance.get = AsyncMock(side_effect=get_side_effect)
        mock_instance.post = AsyncMock(side_effect=post_side_effect)
        mock.return_value.__aenter__.return_value = mock_instance
        yield mock
