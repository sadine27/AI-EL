const EARTH_RADIUS_M = 6371000;

export function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(a, b) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) return "Unknown";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDateTime(value) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

export function formatDurationMinutes(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "0 min";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hrs) return `${mins} min`;
  return `${hrs}h ${mins}m`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function metersFromUnit(value, unit = "m") {
  const numeric = Number(value) || 0;
  return unit === "km" ? numeric * 1000 : numeric;
}

export function unitValueFromMeters(value, unit = "m") {
  const numeric = Number(value) || 0;
  return unit === "km" ? numeric / 1000 : numeric;
}

export function minutesFrom(startIso, endIso = nowIso()) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

export function browserPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }

    const geolocationOptions = {
      enableHighAccuracy: false,
      timeout: 6000,
      maximumAge: 120000,
      ...options
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => reject(error),
      geolocationOptions
    );
  });
}

export async function permissionState(name) {
  if (!navigator.permissions?.query) {
    return "unknown";
  }

  try {
    const result = await navigator.permissions.query({ name });
    return result.state;
  } catch {
    return "unknown";
  }
}

export function pointFromCanvasClick(event, element) {
  const rect = element.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y))
  };
}

export function canvasPointToLatLng(point, center, radiusMeters) {
  const metersPerPercent = (radiusMeters * 2) / 100;
  const northOffset = (50 - point.y) * metersPerPercent;
  const eastOffset = (point.x - 50) * metersPerPercent;
  const lat = center.lat + northOffset / 111320;
  const lng =
    center.lng +
    eastOffset / (111320 * Math.cos(toRadians(center.lat) || 1));

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
}

export function offsetLatLng(center, northMeters = 0, eastMeters = 0) {
  const lat = center.lat + northMeters / 111320;
  const lng =
    center.lng +
    eastMeters / (111320 * Math.cos(toRadians(center.lat) || 1));

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6))
  };
}

export function rectangleCornersFromCenter(center, lengthMeters, widthMeters) {
  const halfLength = Number(lengthMeters || 0) / 2;
  const halfWidth = Number(widthMeters || 0) / 2;

  return [
    offsetLatLng(center, halfLength, -halfWidth),
    offsetLatLng(center, halfLength, halfWidth),
    offsetLatLng(center, -halfLength, halfWidth),
    offsetLatLng(center, -halfLength, -halfWidth)
  ];
}

export function metersVector(from, to) {
  const averageLat = (from.lat + to.lat) / 2;
  return {
    north: (to.lat - from.lat) * 111320,
    east: (to.lng - from.lng) * 111320 * Math.cos(toRadians(averageLat) || 1)
  };
}

export function pointToLocalMeters(point, origin) {
  return metersVector(origin, point);
}

export function localMetersToLatLng(origin, vector) {
  return offsetLatLng(origin, vector.north, vector.east);
}

export function segmentLengthMeters(a, b) {
  return haversineDistanceMeters(a, b);
}

export function orderQuadCorners(points) {
  if (!Array.isArray(points) || points.length !== 4) {
    return Array.isArray(points) ? [...points] : [];
  }

  const centroid = polygonCentroidSimple(points);
  const projected = points
    .map((point) => ({
      point,
      ...pointToLocalMeters(point, centroid)
    }))
    .sort((a, b) => b.north - a.north);

  const top = projected.slice(0, 2).sort((a, b) => a.east - b.east);
  const bottom = projected.slice(2).sort((a, b) => a.east - b.east);

  return [top[0].point, top[1].point, bottom[1].point, bottom[0].point];
}

export function quadDimensionsMeters(points) {
  const ordered = orderQuadCorners(points);
  if (ordered.length !== 4) return polygonDimensionsMeters(points);

  return {
    lengthMeters:
      (segmentLengthMeters(ordered[0], ordered[3]) +
        segmentLengthMeters(ordered[1], ordered[2])) /
      2,
    widthMeters:
      (segmentLengthMeters(ordered[0], ordered[1]) +
        segmentLengthMeters(ordered[3], ordered[2])) /
      2
  };
}

export function quadCenter(points) {
  if (!Array.isArray(points) || !points.length) return null;
  return polygonCentroidSimple(points);
}

export function interpolateLatLng(a, b, t) {
  return {
    lat: Number((a.lat + (b.lat - a.lat) * t).toFixed(6)),
    lng: Number((a.lng + (b.lng - a.lng) * t).toFixed(6))
  };
}

export function quadEdgePoints(points, rowRatio) {
  const ordered = orderQuadCorners(points);
  if (ordered.length !== 4) return null;

  return {
    left: interpolateLatLng(ordered[0], ordered[3], rowRatio),
    right: interpolateLatLng(ordered[1], ordered[2], rowRatio)
  };
}

export function fitQuadToPoints(points) {
  if (!Array.isArray(points) || points.length < 3) return [];

  const centroid = polygonCentroidSimple(points);
  const projected = points.map((point) => pointToLocalMeters(point, centroid));
  const covariance = projected.reduce(
    (accumulator, point) => ({
      xx: accumulator.xx + point.east * point.east,
      xy: accumulator.xy + point.east * point.north,
      yy: accumulator.yy + point.north * point.north
    }),
    { xx: 0, xy: 0, yy: 0 }
  );

  const angle = 0.5 * Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const rotated = projected.map((point) => ({
    u: point.east * cos + point.north * sin,
    v: -point.east * sin + point.north * cos
  }));

  const minU = Math.min(...rotated.map((point) => point.u));
  const maxU = Math.max(...rotated.map((point) => point.u));
  const minV = Math.min(...rotated.map((point) => point.v));
  const maxV = Math.max(...rotated.map((point) => point.v));

  const corners = [
    { u: minU, v: maxV },
    { u: maxU, v: maxV },
    { u: maxU, v: minV },
    { u: minU, v: minV }
  ].map((point) =>
    localMetersToLatLng(centroid, {
      east: point.u * cos - point.v * sin,
      north: point.u * sin + point.v * cos
    })
  );

  return orderQuadCorners(corners);
}

export function quadLengthHeadingDegrees(points) {
  const ordered = orderQuadCorners(points);
  if (ordered.length !== 4) return 0;

  const leftVector = metersVector(ordered[3], ordered[0]);
  const rightVector = metersVector(ordered[2], ordered[1]);
  const north = (leftVector.north + rightVector.north) / 2;
  const east = (leftVector.east + rightVector.east) / 2;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

export function orientedRectangleCorners(center, lengthMeters, widthMeters, headingDegrees = 0) {
  const halfLength = Number(lengthMeters || 0) / 2;
  const halfWidth = Number(widthMeters || 0) / 2;
  const heading = toRadians(headingDegrees);
  const lengthVector = {
    north: Math.cos(heading),
    east: Math.sin(heading)
  };
  const rightVector = {
    north: -lengthVector.east,
    east: lengthVector.north
  };

  return [
    offsetLatLng(
      center,
      halfLength * lengthVector.north - halfWidth * rightVector.north,
      halfLength * lengthVector.east - halfWidth * rightVector.east
    ),
    offsetLatLng(
      center,
      halfLength * lengthVector.north + halfWidth * rightVector.north,
      halfLength * lengthVector.east + halfWidth * rightVector.east
    ),
    offsetLatLng(
      center,
      -halfLength * lengthVector.north + halfWidth * rightVector.north,
      -halfLength * lengthVector.east + halfWidth * rightVector.east
    ),
    offsetLatLng(
      center,
      -halfLength * lengthVector.north - halfWidth * rightVector.north,
      -halfLength * lengthVector.east - halfWidth * rightVector.east
    )
  ];
}

export function leafletBoundsFromCorners(corners) {
  const lats = corners.map((point) => point.lat);
  const lngs = corners.map((point) => point.lng);

  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)]
  ];
}

export function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

export function polygonDimensionsMeters(points) {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;

  return {
    lengthMeters: haversineDistanceMeters(
      { lat: minLat, lng: midLng },
      { lat: maxLat, lng: midLng }
    ),
    widthMeters: haversineDistanceMeters(
      { lat: midLat, lng: minLng },
      { lat: midLat, lng: maxLng }
    )
  };
}

export function polygonAreaSquareMeters(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;

  const averageLat =
    points.reduce((sum, point) => sum + point.lat, 0) / Math.max(points.length, 1);
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(toRadians(averageLat) || 1);

  const projected = points.map((point) => ({
    x: point.lng * metersPerDegreeLng,
    y: point.lat * metersPerDegreeLat
  }));

  let area = 0;
  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index];
    const next = projected[(index + 1) % projected.length];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area / 2);
}

export function latLngToCanvasPoint(coords, center, radiusMeters) {
  const northMeters = (coords.lat - center.lat) * 111320;
  const eastMeters =
    (coords.lng - center.lng) * 111320 * Math.cos(toRadians(center.lat) || 1);
  const percentPerMeter = 100 / (radiusMeters * 2);

  return {
    x: 50 + eastMeters * percentPerMeter,
    y: 50 - northMeters * percentPerMeter
  };
}

export function rectanglePointFromArea(center, areaLengthMeters, areaWidthMeters, coords) {
  const northMeters = (coords.lat - center.lat) * 111320;
  const eastMeters =
    (coords.lng - center.lng) * 111320 * Math.cos(toRadians(center.lat) || 1);

  return {
    x: 50 + (eastMeters / Math.max(areaWidthMeters, 1)) * 100,
    y: 50 - (northMeters / Math.max(areaLengthMeters, 1)) * 100
  };
}

function polygonCentroidSimple(points) {
  const total = points.reduce(
    (accumulator, point) => ({
      lat: accumulator.lat + point.lat,
      lng: accumulator.lng + point.lng
    }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length
  };
}
