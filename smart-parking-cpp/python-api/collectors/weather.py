"""
Weather API collector.
"""

import httpx

WEATHER_URL = "https://weather.googleapis.com/v1/currentConditions:lookup"


async def fetch_weather(center: dict, api_key: str):
    """Fetch current weather conditions with input validation."""
    if not isinstance(center, dict) or "lat" not in center or "lng" not in center:
        raise ValueError("center must be a dict with 'lat' and 'lng' keys")
    params = {
        "key": api_key,
        "location.latitude": center["lat"],
        "location.longitude": center["lng"]
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(WEATHER_URL, params=params)
        if response.status_code != 200:
            raise Exception(f"Weather API HTTP {response.status_code}")
        data = response.json()
        if not isinstance(data, dict):
            raise Exception("Weather API returned non-dict response")
        return data
