"""
Distance Matrix, Routes, and Roads API collectors + route score computation.
Includes comprehensive edge case handling for empty responses, API errors,
and malformed data.
"""

import httpx

DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"
ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
ROADS_URL = "https://roads.googleapis.com/v1/nearestRoads"


async def fetch_distance_matrix(center: dict, api_key: str, user_location: dict | None = None):
    """Fetch distance/time between user and parking area with edge case handling."""
    if not isinstance(center, dict) or "lat" not in center or "lng" not in center:
        raise ValueError("center must be a dict with 'lat' and 'lng' keys")

    origin = user_location if isinstance(user_location, dict) else center
    origin_str = f"{origin.get('lat', 0)},{origin.get('lng', 0)}"
    dest_str = f"{center['lat']},{center['lng']}"

    params = {
        "origins": origin_str,
        "destinations": dest_str,
        "departure_time": "now",
        "mode": "driving",
        "key": api_key
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(DISTANCE_MATRIX_URL, params=params)
        if response.status_code != 200:
            raise Exception(f"Distance Matrix API HTTP {response.status_code}")
        data = response.json()
        api_status = data.get("status", "")
        if api_status not in ("OK", "ZERO_RESULTS"):
            raise Exception(f"Distance Matrix API status: {api_status}")
        return data


async def fetch_routes(center: dict, api_key: str, user_location: dict | None = None):
    """Fetch route duration/distance with edge case handling."""
    if not isinstance(center, dict) or "lat" not in center or "lng" not in center:
        raise ValueError("center must be a dict with 'lat' and 'lng' keys")

    origin = user_location if isinstance(user_location, dict) else center

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            ROUTES_URL,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "routes.duration,routes.distanceMeters"
            },
            json={
                "origin": {
                    "location": {
                        "latLng": {
                            "latitude": origin.get("lat", 0),
                            "longitude": origin.get("lng", 0)
                        }
                    }
                },
                "destination": {
                    "location": {
                        "latLng": {
                            "latitude": center["lat"],
                            "longitude": center["lng"]
                        }
                    }
                },
                "travelMode": "DRIVE",
                "routingPreference": "TRAFFIC_AWARE",
                "computeAlternativeRoutes": False,
                "languageCode": "en-US",
                "units": "METRIC"
            }
        )
        if response.status_code != 200:
            raise Exception(f"Routes API HTTP {response.status_code}")
        return response.json()


async def fetch_roads(center: dict, api_key: str):
    """Fetch nearest road data with edge case handling."""
    if not isinstance(center, dict) or "lat" not in center or "lng" not in center:
        raise ValueError("center must be a dict with 'lat' and 'lng' keys")

    params = {
        "points": f"{center['lat']},{center['lng']}",
        "key": api_key
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(ROADS_URL, params=params)
        if response.status_code != 200:
            raise Exception(f"Roads API HTTP {response.status_code}")
        data = response.json()
        # Roads API returns empty 'snappedPoints' when no road is nearby - that's valid
        warning = data.get("warningMessage", "")
        if "API key" in warning:
            raise Exception(f"Roads API key error: {warning}")
        return data


def compute_route_score(route: dict) -> float:
    """Compute route access cost from route data with edge case safety."""
    def clamp(v, lo=0.0, hi=1.0):
        return max(lo, min(hi, v))

    if not isinstance(route, dict):
        return 0.0

    dist = route.get("distanceMeters", 0) or 0
    dur = route.get("durationSeconds", 0) or 0
    road = bool(route.get("roadMatched", False))

    return clamp(
        (float(dist) / 5000.0) * 0.55 +
        (float(dur) / 900.0) * 0.35 +
        (0.0 if road else 0.1)
    )
