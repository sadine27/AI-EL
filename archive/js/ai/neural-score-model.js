import { sigmoid } from "./ai-utils.js";

export function neuralPressureScore(features) {
  const z =
    -1.35 +
    features.liveOccupancyRatio * 1.75 +
    features.nearbyDemand.demandScore * 1.28 +
    features.historical.pressure * 1.05 +
    features.environment.score * 0.62 +
    features.route.score * 0.42 +
    features.weekend * 0.18 +
    features.peakHour * 0.32;
  return sigmoid(z);
}
