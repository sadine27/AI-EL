import { haversineDistanceMeters } from "../utils/geo.js";
import {
  SHOPPING_PEAK_HOURS,
  WEEKDAY_COMMUTE_HOURS,
  areaCenter,
  clamp,
  dayHourKey,
  isPeakHour,
  isWeekend,
  numeric
} from "./ai-utils.js";

export const TYPE_WEIGHTS = {
  shopping_mall: 1.65,
  department_store: 1.35,
  supermarket: 1.18,
  restaurant: 1.24,
  cafe: 1.0,
  movie_theater: 1.42,
  store: 0.88,
  hospital: 0.82,
  school: 0.76,
  tourist_attraction: 1.2
};

function placePrimaryType(place) {
  const types = Array.isArray(place?.types) ? place.types : [];
  return types.find((type) => TYPE_WEIGHTS[type]) || types[0] || "store";
}

function placeName(place) {
  return String(place?.displayName?.text || place?.name || "Nearby place");
}

function ratingFactor(place) {
  const rating = Number(place?.rating);
  if (!Number.isFinite(rating)) return 1;
  return clamp(0.72 + rating / 10, 0.78, 1.22);
}

function reviewVolumeFactor(place) {
  const count = Number(place?.userRatingCount || 0);
  if (!Number.isFinite(count) || count <= 0) return 0.55;
  return clamp(Math.log10(count + 1) / 3, 0.35, 1.2);
}

function typeHourFactor(type, hour, day) {
  const weekend = day === 0 || day === 6;
  if (type === "school") return hour >= 8 && hour <= 15 && !weekend ? 1.08 : 0.18;
  if (type === "hospital") return 0.74;
  if (type === "movie_theater") return hour >= 17 && hour <= 23 ? 1.18 : 0.28;
  if (type === "restaurant" || type === "cafe") {
    if ([8, 9, 12, 13, 19, 20, 21].includes(hour)) return 1.12;
    return hour >= 10 && hour <= 22 ? 0.72 : 0.18;
  }
  if (type === "shopping_mall" || type === "department_store" || type === "store" || type === "supermarket") {
    if (weekend && hour >= 11 && hour <= 21) return 1.18;
    if (SHOPPING_PEAK_HOURS.has(hour)) return 1.0;
    return hour >= 10 && hour <= 22 ? 0.64 : 0.14;
  }
  return hour >= 9 && hour <= 21 ? 0.62 : 0.18;
}

function isPlaceOpenAt(place, date) {
  const hours = place?.currentOpeningHours || place?.regularOpeningHours;
  if (typeof hours?.openNow === "boolean") return hours.openNow;
  const periods = Array.isArray(hours?.periods) ? hours.periods : [];
  if (!periods.length) return true;

  const currentMinutes = date.getDay() * 1440 + date.getHours() * 60 + date.getMinutes();
  return periods.some((period) => {
    const open = period.open;
    const close = period.close;
    if (!open || !Number.isFinite(Number(open.day)) || !Number.isFinite(Number(open.hour))) return false;
    const openMinutes = Number(open.day) * 1440 + Number(open.hour) * 60 + Number(open.minute || 0);
    const closeMinutes = close && Number.isFinite(Number(close.day)) && Number.isFinite(Number(close.hour))
      ? Number(close.day) * 1440 + Number(close.hour) * 60 + Number(close.minute || 0)
      : openMinutes + 1440;
    const normalizedClose = closeMinutes <= openMinutes ? closeMinutes + 7 * 1440 : closeMinutes;
    const normalizedNow = currentMinutes < openMinutes ? currentMinutes + 7 * 1440 : currentMinutes;
    return normalizedNow >= openMinutes && normalizedNow < normalizedClose;
  });
}

function syntheticDemand(date) {
  const hour = date.getHours();
  const weekend = isWeekend(date);
  let demand = 0.28;
  if (WEEKDAY_COMMUTE_HOURS.has(hour) && !weekend) demand += 0.18;
  if (SHOPPING_PEAK_HOURS.has(hour)) demand += 0.22;
  if (weekend && hour >= 11 && hour <= 21) demand += 0.2;
  if (hour >= 22 || hour <= 6) demand -= 0.16;
  return clamp(demand, 0.08, 0.78);
}

function demandFromPlaces(places, date) {
  if (!Array.isArray(places) || !places.length) {
    return {
      demandScore: syntheticDemand(date),
      placeCount: 0,
      openPlaceCount: 0,
      topPlaces: [],
      source: "local-syllabus-model"
    };
  }

  const scored = places.map((place) => {
    const type = placePrimaryType(place);
    const open = isPlaceOpenAt(place, date);
    const location = place?.location;
    const rawScore =
      (TYPE_WEIGHTS[type] || 0.72) *
      typeHourFactor(type, date.getHours(), date.getDay()) *
      ratingFactor(place) *
      reviewVolumeFactor(place) *
      (open ? 1 : 0.16);
    return {
      name: placeName(place),
      type,
      open,
      score: rawScore,
      lat: numeric(location?.latitude, null),
      lng: numeric(location?.longitude, null)
    };
  });

  const totalScore = scored.reduce((sum, item) => sum + item.score, 0);
  const demandScore = clamp(totalScore / Math.max(4.5, scored.length * 0.92), 0.04, 0.96);
  return {
    demandScore,
    placeCount: scored.length,
    openPlaceCount: scored.filter((item) => item.open).length,
    topPlaces: scored.sort((a, b) => b.score - a.score).slice(0, 4),
    source: "google-places-api"
  };
}

function extractSignal(signals, name) {
  return Array.isArray(signals) ? signals.find((signal) => signal.name === name && signal.status === "ready")?.data : null;
}

function weatherPenalty(weather) {
  if (!weather) return 0;
  const precipitation = numeric(weather?.precipitation?.probability?.percent) / 100;
  const thunderstorm = numeric(weather?.thunderstormProbability) / 100;
  const visibility = numeric(weather?.visibility?.distance, 16);
  const cloudCover = numeric(weather?.cloudCover) / 100;
  const wind = numeric(weather?.wind?.speed?.value);
  return clamp(precipitation * 0.38 + thunderstorm * 0.32 + clamp((8 - visibility) / 8) * 0.12 + cloudCover * 0.06 + clamp(wind / 45) * 0.12);
}

function environmentPenalty(signals) {
  const weather = extractSignal(signals, "Weather API");
  const airQuality = extractSignal(signals, "Air Quality API");
  const pollen = extractSignal(signals, "Pollen API");
  const weatherScore = weatherPenalty(weather);
  const aqi = numeric(airQuality?.indexes?.[0]?.aqi);
  const aqiScore = aqi ? clamp((aqi - 40) / 180, 0, 1) : 0;
  const pollenValues = (pollen?.dailyInfo?.[0]?.pollenTypeInfo || [])
    .map((item) => numeric(item?.indexInfo?.value, 0))
    .filter((value) => value > 0);
  const pollenScore = pollenValues.length ? clamp(Math.max(...pollenValues) / 5) : 0;

  return {
    score: clamp(weatherScore * 0.58 + aqiScore * 0.28 + pollenScore * 0.14),
    weatherScore,
    aqiScore,
    pollenScore
  };
}

function routeAccessCost(signals) {
  const matrix = extractSignal(signals, "Distance Matrix API");
  const routes = extractSignal(signals, "Routes API");
  const road = extractSignal(signals, "Roads API");
  const route = routes?.routes?.[0];
  const element = matrix?.rows?.[0]?.elements?.[0];
  const distanceMeters = numeric(route?.distanceMeters, numeric(element?.distance?.value));
  const durationSeconds = Number.parseInt(String(route?.duration || "").replace("s", ""), 10) || numeric(element?.duration_in_traffic?.value, numeric(element?.duration?.value));
  const roadMatched = Array.isArray(road?.snappedPoints) && road.snappedPoints.length > 0;

  return {
    score: clamp(distanceMeters / 5000 * 0.55 + durationSeconds / 900 * 0.35 + (roadMatched ? 0 : 0.1)),
    distanceMeters,
    durationSeconds,
    roadMatched
  };
}

function buildHistoricalTraining(logs, totalSlots, date) {
  const targetKey = dayHourKey(date);
  const rows = [];

  (logs || []).forEach((log) => {
    const start = new Date(log.entry_time || log.created_at || "");
    if (!Number.isFinite(start.getTime())) return;
    const end = log.exit_time ? new Date(log.exit_time) : new Date();
    const durationMinutes = Math.max(15, Number(log.duration_minutes) || (end - start) / 60000 || 45);
    const occupiedShare = clamp(1 / Math.max(1, totalSlots), 0, 1);
    rows.push({
      key: dayHourKey(start),
      hour: start.getHours(),
      day: start.getDay(),
      weekend: start.getDay() === 0 || start.getDay() === 6 ? 1 : 0,
      peakHour: WEEKDAY_COMMUTE_HOURS.has(start.getHours()) || SHOPPING_PEAK_HOURS.has(start.getHours()) ? 1 : 0,
      durationMinutes,
      occupiedShare
    });
  });

  const exactRows = rows.filter((row) => row.key === targetKey);
  const closeRows = rows.filter((row) => Math.abs(row.hour - date.getHours()) <= 1 || row.day === date.getDay());
  const trainingRows = exactRows.length ? exactRows : closeRows;
  const pressure = trainingRows.reduce((sum, row) => {
    const durationFactor = clamp(row.durationMinutes / 90, 0.35, 1.45);
    return sum + row.occupiedShare * durationFactor;
  }, 0);

  return {
    rows,
    rowCount: rows.length,
    matchedRows: trainingRows.length,
    pressure: clamp(pressure, 0, 0.92)
  };
}

export function buildFeatureVector(area, slots, logs, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const external = options.externalSignals || options.demandSignal || {};
  const signals = Array.isArray(external.signals) ? external.signals : [];
  const places = options.places || external.places || [];
  const totalSlots = slots.length;
  const unavailable = slots.filter((slot) => slot.status !== "unoccupied").length;
  const liveOccupancyRatio = totalSlots ? unavailable / totalSlots : 0;
  const nearbyDemand = demandFromPlaces(places, now);
  const environment = environmentPenalty(signals);
  const route = routeAccessCost(signals);
  const historical = buildHistoricalTraining(logs, Math.max(totalSlots, 1), now);

  return {
    now,
    areaCenter: areaCenter(area),
    totalSlots,
    unavailable,
    liveAvailable: totalSlots - unavailable,
    liveOccupancyRatio,
    nearbyDemand,
    environment,
    route,
    historical,
    weekend: isWeekend(now) ? 1 : 0,
    peakHour: isPeakHour(now) ? 1 : 0,
    apiCatalog: external.apiCatalog || [],
    readyApiCount: numeric(external.readyApiCount),
    activeApiCount: numeric(external.activeApiCount),
    failedApiCount: numeric(external.failedApiCount),
    source: external.source || nearbyDemand.source
  };
}

export function scoreFreeSlot(slot, area) {
  const center = areaCenter(area);
  const slotPoint = {
    lat: Number(slot.center_lat || slot.position_lat),
    lng: Number(slot.center_lng || slot.position_lng)
  };
  if (!Number.isFinite(center.lat) || !Number.isFinite(slotPoint.lat)) return 0.5;
  const distance = haversineDistanceMeters(center, slotPoint);
  return clamp(1 - distance / Math.max(1, Number(area.radius_meters || 80)), 0, 1);
}
