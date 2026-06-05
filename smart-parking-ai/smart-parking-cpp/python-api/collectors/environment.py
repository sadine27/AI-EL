"""
Air Quality and Pollen API collectors + environment score computation.
Includes edge case handling for empty responses, API errors,
and extreme/non-numeric values.
"""

import httpx
import math

AIR_QUALITY_URL = "https://airquality.googleapis.com/v1/currentConditions:lookup"
POLLEN_URL = "https://pollen.googleapis.com/v1/forecast:lookup"


async def fetch_air_quality(center: dict, api_key: str):
    """Fetch current air quality index with response validation."""
    if not isinstance(center, dict) or "lat" not in center or "lng" not in center:
        raise ValueError("center must be a dict with 'lat' and 'lng' keys")

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            AIR_QUALITY_URL,
            params={"key": api_key},
            json={
                "universalAqi": True,
                "location": {
                    "latitude": center["lat"],
                    "longitude": center["lng"]
                },
                "extraComputations": ["LOCAL_AQI", "DOMINANT_POLLUTANT_CONCENTRATION"],
                "languageCode": "en"
            }
        )
        if response.status_code != 200:
            raise Exception(f"Air Quality API HTTP {response.status_code}")
        data = response.json()
        if not isinstance(data, dict):
            raise Exception("Air Quality API returned non-dict response")
        return data


async def fetch_pollen(center: dict, api_key: str):
    """Fetch pollen forecast with response validation."""
    if not isinstance(center, dict) or "lat" not in center or "lng" not in center:
        raise ValueError("center must be a dict with 'lat' and 'lng' keys")

    params = {
        "key": api_key,
        "location.latitude": center["lat"],
        "location.longitude": center["lng"],
        "days": 1,
        "plantsDescription": False
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(POLLEN_URL, params=params)
        if response.status_code != 200:
            raise Exception(f"Pollen API HTTP {response.status_code}")
        data = response.json()
        if not isinstance(data, dict):
            raise Exception("Pollen API returned non-dict response")
        return data


def compute_environment_score(env: dict) -> float:
    """Compute environment penalty from weather, AQI, and pollen data.
    Handles missing keys, NaN, Infinity, negative values gracefully."""
    def clamp(v, lo=0.0, hi=1.0):
        return max(lo, min(hi, v))

    def safe_float(val, default=0.0):
        """Safely convert any value to float, handling edge cases."""
        if val is None:
            return default
        try:
            f = float(val)
            if math.isnan(f) or math.isinf(f):
                return default
            return max(f, 0.0)  # No negative values
        except (TypeError, ValueError):
            return default

    weather_score = clamp(
        safe_float(env.get("precipitationProb", 0)) * 0.38 +
        safe_float(env.get("thunderstormProb", 0)) * 0.32 +
        clamp((8.0 - safe_float(env.get("visibilityKm", 16))) / 8.0) * 0.12 +
        safe_float(env.get("cloudCover", 0)) * 0.06 +
        clamp(safe_float(env.get("windSpeed", 0)) / 45.0) * 0.12
    )

    aqi = safe_float(env.get("aqi", 0))
    aqi_score = clamp((aqi - 40) / 180.0) if aqi > 0 else 0.0

    pollen = clamp(safe_float(env.get("pollenScore", 0)) / 5.0)

    return clamp(weather_score * 0.58 + aqi_score * 0.28 + pollen * 0.14)
