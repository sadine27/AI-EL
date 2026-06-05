"""
Smart Parking AI - Google API Collector Module
Catalog of all 33 Google Maps Platform APIs with their usage modes.
"""

API_CATALOG = [
    {"name": "Address Validation API", "group": "location", "mode": "conditional", "feature": "Address quality and location confidence"},
    {"name": "Aerial View API", "group": "presentation", "mode": "context", "feature": "Aerial report/demo visualization"},
    {"name": "Air Quality API", "group": "environment", "mode": "live", "feature": "AQI and pollution comfort penalty"},
    {"name": "Directions API", "group": "route", "mode": "legacy", "feature": "Route effort compatibility signal"},
    {"name": "Distance Matrix API", "group": "route", "mode": "conditional", "feature": "Travel time between user/place and parking area"},
    {"name": "Geocoding API", "group": "location", "mode": "live", "feature": "Reverse-geocoded locality context"},
    {"name": "Geolocation API", "group": "location", "mode": "conditional", "feature": "Approximate user position if browser GPS is absent"},
    {"name": "Map Management API", "group": "management", "mode": "context", "feature": "Map style/project management, not prediction"},
    {"name": "Map Tiles API", "group": "presentation", "mode": "context", "feature": "Basemap visualization"},
    {"name": "Maps 3D SDK for Android", "group": "mobile", "mode": "context", "feature": "Future Android 3D view"},
    {"name": "Maps 3D SDK for iOS", "group": "mobile", "mode": "context", "feature": "Future iOS 3D view"},
    {"name": "Maps Platform Datasets API", "group": "data", "mode": "context", "feature": "Future custom parking dataset hosting"},
    {"name": "Maps Elevation API", "group": "environment", "mode": "live", "feature": "Slope/accessibility estimate"},
    {"name": "Maps Embed API", "group": "presentation", "mode": "context", "feature": "Embeddable map for report/demo"},
    {"name": "Maps Grounding Lite API", "group": "grounding", "mode": "context", "feature": "Grounded location explanations"},
    {"name": "Maps JavaScript API", "group": "presentation", "mode": "context", "feature": "Interactive map UI"},
    {"name": "Maps SDK for Android", "group": "mobile", "mode": "context", "feature": "Future Android app"},
    {"name": "Maps SDK for iOS", "group": "mobile", "mode": "context", "feature": "Future iOS app"},
    {"name": "Maps Static API", "group": "presentation", "mode": "derived", "feature": "Static report/PPT image URL"},
    {"name": "Navigation SDK", "group": "mobile", "mode": "context", "feature": "Future turn-by-turn mobile navigation"},
    {"name": "Places Aggregate API", "group": "places", "mode": "context", "feature": "Area-level place-density extension"},
    {"name": "Places API", "group": "places", "mode": "legacy", "feature": "Legacy nearby/search compatibility"},
    {"name": "Places API (New)", "group": "places", "mode": "live", "feature": "Nearby shop demand"},
    {"name": "Places UI Kit", "group": "presentation", "mode": "context", "feature": "Future place search UI components"},
    {"name": "Pollen API", "group": "environment", "mode": "live", "feature": "Pollen discomfort signal"},
    {"name": "Roads API", "group": "route", "mode": "live", "feature": "Nearest-road access signal"},
    {"name": "Route Optimization API", "group": "optimization", "mode": "context", "feature": "Future multi-area route ordering"},
    {"name": "Routes API", "group": "route", "mode": "conditional", "feature": "Modern route distance and duration"},
    {"name": "Solar API", "group": "environment", "mode": "context", "feature": "Optional shade/solar context extension"},
    {"name": "Street View Publish API", "group": "presentation", "mode": "context", "feature": "Publishing imagery, not prediction"},
    {"name": "Street View Static API", "group": "presentation", "mode": "derived", "feature": "Street-level report/PPT image URL"},
    {"name": "Time Zone API", "group": "time", "mode": "live", "feature": "Correct local hour/day at parking area"},
    {"name": "Weather API", "group": "environment", "mode": "live", "feature": "Rain, visibility, wind, humidity, temperature"},
]

CATALOG = API_CATALOG
