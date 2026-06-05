"""
Geocoding, Time Zone, and Elevation API collectors + response validation.
"""

import httpx
import time

GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json"
TIMEZONE_URL = "https://maps.googleapis.com/maps/api/timezone/json"
ELEVATION_URL = "https://maps.googleapis.com/maps/api/elevation/json"


async def fetch_geocoding(center: dict, api_key: str):
    """Fetch reverse geocoding data with edge case handling."""
    if not isinstance(center, dict) or "lat" not in center or "lng" not in center:
        raise ValueError("center must be a dict with 'lat' and 'lng' keys")

    params = {
        "latlng": f"{center['lat']},{center['lng']}",
        "key": api_key
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(GEOCODING_URL, params=params)
        if response.status_code != 200:
            raise Exception(f"Geocoding API HTTP {response.status_code}")
        data = response.json()
        # Validate API response status
        api_status = data.get("status", "")
        if api_status == "REQUEST_DENIED":
            raise Exception("Geocoding API: Request denied (invalid key?)")
        if api_status == "OVER_QUERY_LIMIT":
            raise Exception("Geocoding API: Over query limit")
        if api_status == "ZERO_RESULTS":
            return {"status": "ZERO_RESULTS", "results": [], "address_components": []}
        return data


async def fetch_timezone(center: dict, api_key: str):
    """Fetch time zone data with edge case handling."""
    if not isinstance(center, dict) or "lat" not in center or "lng" not in center:
        raise ValueError("center must be a dict with 'lat' and 'lng' keys")

    params = {
        "location": f"{center['lat']},{center['lng']}",
        "timestamp": int(time.time()),
        "key": api_key
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(TIMEZONE_URL, params=params)
        if response.status_code != 200:
            raise Exception(f"Time Zone API HTTP {response.status_code}")
        data = response.json()
        api_status = data.get("status", "")
        if api_status != "OK":
            raise Exception(f"Time Zone API status: {api_status}")
        return data


async def fetch_elevation(center: dict, api_key: str):
    """Fetch elevation data with edge case handling."""
    if not isinstance(center, dict) or "lat" not in center or "lng" not in center:
        raise ValueError("center must be a dict with 'lat' and 'lng' keys")

    params = {
        "locations": f"{center['lat']},{center['lng']}",
        "key": api_key
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(ELEVATION_URL, params=params)
        if response.status_code != 200:
            raise Exception(f"Elevation API HTTP {response.status_code}")
        data = response.json()
        api_status = data.get("status", "")
        if api_status not in ("OK", "DATA_NOT_AVAILABLE"):
            raise Exception(f"Elevation API status: {api_status}")
        return data
