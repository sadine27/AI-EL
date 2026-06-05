import { areaCenter, normalizeApiError, numeric } from "./ai-utils.js";

export const GOOGLE_MAPS_API_CATALOG = [
  { name: "Address Validation API", group: "location", mode: "conditional", feature: "Address quality and location confidence" },
  { name: "Aerial View API", group: "presentation", mode: "context", feature: "Aerial report/demo visualization" },
  { name: "Air Quality API", group: "environment", mode: "live", feature: "AQI and pollution comfort penalty" },
  { name: "Directions API", group: "route", mode: "legacy", feature: "Route effort compatibility signal" },
  { name: "Distance Matrix API", group: "route", mode: "conditional", feature: "Travel time between user/place and parking area" },
  { name: "Geocoding API", group: "location", mode: "live", feature: "Reverse-geocoded locality context" },
  { name: "Geolocation API", group: "location", mode: "conditional", feature: "Approximate user position if browser GPS is absent" },
  { name: "Map Management API", group: "management", mode: "context", feature: "Map style/project management, not prediction" },
  { name: "Map Tiles API", group: "presentation", mode: "context", feature: "Basemap visualization" },
  { name: "Maps 3D SDK for Android", group: "mobile", mode: "context", feature: "Future Android 3D view" },
  { name: "Maps 3D SDK for iOS", group: "mobile", mode: "context", feature: "Future iOS 3D view" },
  { name: "Maps Platform Datasets API", group: "data", mode: "context", feature: "Future custom parking dataset hosting" },
  { name: "Maps Elevation API", group: "environment", mode: "live", feature: "Slope/accessibility estimate" },
  { name: "Maps Embed API", group: "presentation", mode: "context", feature: "Embeddable map for report/demo" },
  { name: "Maps Grounding Lite API", group: "grounding", mode: "context", feature: "Grounded location explanations" },
  { name: "Maps JavaScript API", group: "presentation", mode: "context", feature: "Interactive map UI" },
  { name: "Maps SDK for Android", group: "mobile", mode: "context", feature: "Future Android app" },
  { name: "Maps SDK for iOS", group: "mobile", mode: "context", feature: "Future iOS app" },
  { name: "Maps Static API", group: "presentation", mode: "derived", feature: "Static report/PPT image URL" },
  { name: "Navigation SDK", group: "mobile", mode: "context", feature: "Future turn-by-turn mobile navigation" },
  { name: "Places Aggregate API", group: "places", mode: "context", feature: "Area-level place-density extension" },
  { name: "Places API", group: "places", mode: "legacy", feature: "Legacy nearby/search compatibility" },
  { name: "Places API (New)", group: "places", mode: "live", feature: "Nearby shop demand" },
  { name: "Places UI Kit", group: "presentation", mode: "context", feature: "Future place search UI components" },
  { name: "Pollen API", group: "environment", mode: "live", feature: "Pollen discomfort signal" },
  { name: "Roads API", group: "route", mode: "live", feature: "Nearest-road access signal" },
  { name: "Route Optimization API", group: "optimization", mode: "context", feature: "Future multi-area route ordering" },
  { name: "Routes API", group: "route", mode: "conditional", feature: "Modern route distance and duration" },
  { name: "Solar API", group: "environment", mode: "context", feature: "Optional shade/solar context extension" },
  { name: "Street View Publish API", group: "presentation", mode: "context", feature: "Publishing imagery, not prediction" },
  { name: "Street View Static API", group: "presentation", mode: "derived", feature: "Street-level report/PPT image URL" },
  { name: "Time Zone API", group: "time", mode: "live", feature: "Correct local hour/day at parking area" },
  { name: "Weather API", group: "environment", mode: "live", feature: "Rain, visibility, wind, humidity, temperature" }
];

const GOOGLE_PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby";
const WEATHER_CURRENT_URL = "https://weather.googleapis.com/v1/currentConditions:lookup";
const AIR_QUALITY_URL = "https://airquality.googleapis.com/v1/currentConditions:lookup";
const POLLEN_FORECAST_URL = "https://pollen.googleapis.com/v1/forecast:lookup";
const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const TIME_ZONE_URL = "https://maps.googleapis.com/maps/api/timezone/json";
const ELEVATION_URL = "https://maps.googleapis.com/maps/api/elevation/json";
const ROADS_NEAREST_URL = "https://roads.googleapis.com/v1/nearestRoads";
const DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export const PLACE_TYPES = [
  "shopping_mall",
  "department_store",
  "supermarket",
  "restaurant",
  "cafe",
  "movie_theater",
  "store",
  "hospital",
  "school",
  "tourist_attraction"
];

function buildUrl(base, params) {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function collectSignal(name, task) {
  try {
    const data = await task();
    return { name, status: "ready", data };
  } catch (error) {
    return { name, status: "error", error: normalizeApiError(error) };
  }
}

function staticUrls(center, apiKey) {
  const marker = `${center.lat},${center.lng}`;
  return {
    mapsStaticUrl: buildUrl("https://maps.googleapis.com/maps/api/staticmap", {
      center: marker,
      zoom: 18,
      size: "640x360",
      maptype: "satellite",
      markers: `color:red|${marker}`,
      key: apiKey
    }),
    streetViewStaticUrl: buildUrl("https://maps.googleapis.com/maps/api/streetview", {
      size: "640x360",
      location: marker,
      fov: 80,
      heading: 70,
      pitch: 0,
      key: apiKey
    }),
    mapsEmbedUrl: buildUrl("https://www.google.com/maps/embed/v1/view", {
      key: apiKey,
      center: marker,
      zoom: 18,
      maptype: "satellite"
    })
  };
}

export async function fetchPlacesSignal(area, apiKey, options = {}) {
  const center = areaCenter(area);
  const radiusMeters = Math.max(150, Math.min(1500, numeric(options.radiusMeters, numeric(area?.radius_meters, 150) * 4 || 600)));
  const response = await fetch(GOOGLE_PLACES_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.types",
        "places.rating",
        "places.userRatingCount",
        "places.currentOpeningHours",
        "places.regularOpeningHours",
        "places.businessStatus",
        "places.location"
      ].join(",")
    },
    body: JSON.stringify({
      includedTypes: PLACE_TYPES,
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: {
            latitude: center.lat,
            longitude: center.lng
          },
          radius: radiusMeters
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = await response.json();
  return {
    places: Array.isArray(result?.places) ? result.places : [],
    radiusMeters
  };
}

async function fetchWeatherSignal(center, apiKey) {
  return fetchJson(buildUrl(WEATHER_CURRENT_URL, {
    key: apiKey,
    "location.latitude": center.lat,
    "location.longitude": center.lng
  }));
}

async function fetchAirQualitySignal(center, apiKey) {
  return fetchJson(buildUrl(AIR_QUALITY_URL, { key: apiKey }), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      universalAqi: true,
      location: {
        latitude: center.lat,
        longitude: center.lng
      },
      extraComputations: ["LOCAL_AQI", "DOMINANT_POLLUTANT_CONCENTRATION"],
      languageCode: "en"
    })
  });
}

async function fetchPollenSignal(center, apiKey) {
  return fetchJson(buildUrl(POLLEN_FORECAST_URL, {
    key: apiKey,
    "location.latitude": center.lat,
    "location.longitude": center.lng,
    days: 1,
    plantsDescription: false
  }));
}

async function fetchGeocodingSignal(center, apiKey) {
  return fetchJson(buildUrl(GEOCODING_URL, {
    latlng: `${center.lat},${center.lng}`,
    key: apiKey
  }));
}

async function fetchTimeZoneSignal(center, apiKey, now) {
  return fetchJson(buildUrl(TIME_ZONE_URL, {
    location: `${center.lat},${center.lng}`,
    timestamp: Math.floor(now.getTime() / 1000),
    key: apiKey
  }));
}

async function fetchElevationSignal(center, apiKey) {
  return fetchJson(buildUrl(ELEVATION_URL, {
    locations: `${center.lat},${center.lng}`,
    key: apiKey
  }));
}

async function fetchRoadsSignal(center, apiKey) {
  return fetchJson(buildUrl(ROADS_NEAREST_URL, {
    points: `${center.lat},${center.lng}`,
    key: apiKey
  }));
}

async function fetchDistanceMatrixSignal(area, apiKey, userLocation) {
  if (!userLocation?.lat || !userLocation?.lng) return null;
  const center = areaCenter(area);
  return fetchJson(buildUrl(DISTANCE_MATRIX_URL, {
    origins: `${userLocation.lat},${userLocation.lng}`,
    destinations: `${center.lat},${center.lng}`,
    departure_time: "now",
    mode: "driving",
    key: apiKey
  }));
}

async function fetchRoutesSignal(area, apiKey, userLocation) {
  if (!userLocation?.lat || !userLocation?.lng) return null;
  const center = areaCenter(area);
  return fetchJson(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters"
    },
    body: JSON.stringify({
      origin: {
        location: {
          latLng: {
            latitude: numeric(userLocation.lat),
            longitude: numeric(userLocation.lng)
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: center.lat,
            longitude: center.lng
          }
        }
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: false,
      languageCode: "en-US",
      units: "METRIC"
    })
  });
}

export async function fetchParkingContextSignals(area, options = {}) {
  const apiKey = String(options.apiKey || "").trim();
  if (!apiKey) throw new Error("Google Maps API key is required for live AI signals.");

  const now = options.now instanceof Date ? options.now : new Date();
  const center = areaCenter(area);
  const userLocation = options.userLocation || null;

  const liveSignals = await Promise.all([
    collectSignal("Places API (New)", () => fetchPlacesSignal(area, apiKey, options)),
    collectSignal("Weather API", () => fetchWeatherSignal(center, apiKey)),
    collectSignal("Air Quality API", () => fetchAirQualitySignal(center, apiKey)),
    collectSignal("Pollen API", () => fetchPollenSignal(center, apiKey)),
    collectSignal("Geocoding API", () => fetchGeocodingSignal(center, apiKey)),
    collectSignal("Time Zone API", () => fetchTimeZoneSignal(center, apiKey, now)),
    collectSignal("Maps Elevation API", () => fetchElevationSignal(center, apiKey)),
    collectSignal("Roads API", () => fetchRoadsSignal(center, apiKey)),
    collectSignal("Distance Matrix API", () => fetchDistanceMatrixSignal(area, apiKey, userLocation)),
    collectSignal("Routes API", () => fetchRoutesSignal(area, apiKey, userLocation))
  ]);

  const placesSignal = liveSignals.find((signal) => signal.name === "Places API (New)");
  const derivedSignals = staticUrls(center, apiKey);
  const catalog = GOOGLE_MAPS_API_CATALOG.map((api) => {
    const live = liveSignals.find((signal) => signal.name === api.name);
    if (live) return { ...api, status: live.status, error: live.error || "" };
    if (api.mode === "derived") return { ...api, status: "derived" };
    return { ...api, status: api.mode === "context" ? "context" : "planned" };
  });

  return {
    source: "google-maps-platform-signals",
    updatedAt: now.toISOString(),
    places: Array.isArray(placesSignal?.data?.places) ? placesSignal.data.places : [],
    signals: liveSignals,
    derivedSignals,
    apiCatalog: catalog,
    activeApiCount: catalog.filter((api) => ["ready", "derived", "context"].includes(api.status)).length,
    readyApiCount: catalog.filter((api) => api.status === "ready").length,
    failedApiCount: catalog.filter((api) => api.status === "error").length
  };
}

export async function fetchNearbyPlacesDemand(area, options = {}) {
  return fetchParkingContextSignals(area, options);
}
