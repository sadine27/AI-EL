export const WEEKDAY_COMMUTE_HOURS = new Set([8, 9, 17, 18, 19]);
export const SHOPPING_PEAK_HOURS = new Set([12, 13, 18, 19, 20]);

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

export function areaCenter(area) {
  return {
    lat: numeric(area?.center_lat),
    lng: numeric(area?.center_lng)
  };
}

export function dayHourKey(date) {
  return `${date.getDay()}-${date.getHours()}`;
}

export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isPeakHour(date) {
  return WEEKDAY_COMMUTE_HOURS.has(date.getHours()) || SHOPPING_PEAK_HOURS.has(date.getHours());
}

export function normalizeApiError(error) {
  return error?.message || "Signal unavailable";
}
