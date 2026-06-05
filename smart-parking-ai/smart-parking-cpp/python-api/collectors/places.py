"""
Places API (New) collector and demand score computation.
Includes edge case handling for API errors, empty results, and boundary inputs.
"""

import httpx
import math

PLACE_TYPES = [
    "shopping_mall", "department_store", "supermarket",
    "restaurant", "cafe", "movie_theater", "store",
    "hospital", "school", "tourist_attraction"
]

TYPE_WEIGHTS = {
    "shopping_mall": 1.65, "department_store": 1.35, "supermarket": 1.18,
    "restaurant": 1.24, "cafe": 1.0, "movie_theater": 1.42,
    "store": 0.88, "hospital": 0.82, "school": 0.76, "tourist_attraction": 1.2
}

PLACE_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby"


async def fetch_nearby_places(center: dict, api_key: str, radius_meters: int = 600):
    """Fetch nearby places from Places API (New) with edge case handling."""
    if not isinstance(center, dict) or "lat" not in center or "lng" not in center:
        raise ValueError("center must be a dict with 'lat' and 'lng' keys")

    # Clamp radius to valid range
    radius = max(1, min(2000, radius_meters))

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            PLACE_SEARCH_URL,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": (
                    "places.id,places.displayName,places.types,places.rating,"
                    "places.userRatingCount,places.currentOpeningHours,"
                    "places.regularOpeningHours,places.businessStatus,places.location"
                )
            },
            json={
                "includedTypes": PLACE_TYPES,
                "maxResultCount": 20,
                "locationRestriction": {
                    "circle": {
                        "center": {"latitude": center["lat"], "longitude": center["lng"]},
                        "radius": radius
                    }
                }
            }
        )

        if response.status_code != 200:
            raise Exception(f"Places API HTTP {response.status_code}")

        result = response.json()
        if not isinstance(result, dict):
            raise Exception("Places API returned non-dict response")

        places_raw = result.get("places", [])
        if not isinstance(places_raw, list):
            places_raw = []

        places = []
        for p in places_raw:
            if not isinstance(p, dict):
                continue
            loc = p.get("location", {})
            if not isinstance(loc, dict):
                loc = {}
            types = p.get("types", [])
            if not isinstance(types, list):
                types = []
            primary_type = next((t for t in types if t in TYPE_WEIGHTS),
                                types[0] if types else "store")
            display_name = p.get("displayName", {})
            if not isinstance(display_name, dict):
                display_name = {}

            place = {
                "name": display_name.get("text", p.get("name", "Place")),
                "type": primary_type,
                "open": bool(p.get("currentOpeningHours", {}).get("openNow", True)),
                "rating": float(p.get("rating", 0) or 0),
                "reviewCount": int(p.get("userRatingCount", 0) or 0),
                "lat": float(loc.get("latitude", 0) or 0),
                "lng": float(loc.get("longitude", 0) or 0)
            }
            places.append(place)

        return {"places": places, "radiusMeters": radius}


def compute_demand_score(places: list, hour: int, day: int) -> float:
    """Compute nearby demand score from places data with edge case safety."""
    if not isinstance(places, list) or len(places) == 0:
        return _synthetic_demand(hour, day)

    total_score = 0.0
    for p in places:
        if not isinstance(p, dict):
            continue
        tw = TYPE_WEIGHTS.get(p.get("type", "store"), 0.72)
        tf = _type_hour_factor(p.get("type", "store"), hour, day)
        rf = _rating_factor(p.get("rating", 0))
        rvf = _review_volume_factor(p.get("reviewCount", 0))
        open_factor = 1.0 if p.get("open", True) else 0.16
        total_score += tw * tf * rf * rvf * open_factor

    n = len(places)
    demand = total_score / max(4.5, n * 0.92)
    return max(0.04, min(0.96, demand))


def _synthetic_demand(hour: int, day: int) -> float:
    """Generate synthetic demand when no real places data."""
    # Clamp inputs
    hour = max(0, min(23, hour))
    day = max(0, min(6, day))
    weekend = day in (0, 6)
    demand = 0.28
    if hour in (8, 9, 17, 18, 19) and not weekend:
        demand += 0.18
    if hour in (12, 13, 18, 19, 20):
        demand += 0.22
    if weekend and 11 <= hour <= 21:
        demand += 0.20
    if hour >= 22 or hour <= 6:
        demand -= 0.16
    return max(0.08, min(0.78, demand))


def _type_hour_factor(place_type: str, hour: int, day: int) -> float:
    """Time-of-day factor for a place type with edge case safety."""
    hour = max(0, min(23, hour))
    day = max(0, min(6, day))
    weekend = day in (0, 6)

    if not isinstance(place_type, str):
        return 0.62 if (9 <= hour <= 21) else 0.18

    if place_type == "school":
        return 1.08 if (8 <= hour <= 15 and not weekend) else 0.18
    if place_type == "hospital":
        return 0.74
    if place_type == "movie_theater":
        return 1.18 if (17 <= hour <= 23) else 0.28
    if place_type in ("restaurant", "cafe"):
        if hour in (8, 9, 12, 13, 19, 20, 21):
            return 1.12
        return 0.72 if (10 <= hour <= 22) else 0.18
    if place_type in ("shopping_mall", "department_store", "store", "supermarket"):
        if weekend and 11 <= hour <= 21:
            return 1.18
        if hour in (12, 13, 18, 19, 20):
            return 1.0
        return 0.64 if (10 <= hour <= 22) else 0.14
    return 0.62 if (9 <= hour <= 21) else 0.18


def _rating_factor(rating: float) -> float:
    """Convert rating to a multiplier, handles edge values."""
    try:
        rating = float(rating)
    except (TypeError, ValueError):
        return 1.0
    if rating <= 0 or math.isnan(rating) or math.isinf(rating):
        return 1.0
    return max(0.78, min(1.22, 0.72 + rating / 10.0))


def _review_volume_factor(count: int) -> float:
    """Convert review count to a multiplier, handles edge values."""
    try:
        count = int(count)
    except (TypeError, ValueError):
        return 0.55
    if count <= 0:
        return 0.55
    return max(0.35, min(1.20, math.log10(count + 1) / 3.0))
