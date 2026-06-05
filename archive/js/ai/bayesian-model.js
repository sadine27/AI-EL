import { clamp } from "./ai-utils.js";

export function bayesianPressure(features) {
  const peakLikelihood = features.peakHour ? 0.64 : 0.32;
  const demand = features.nearbyDemand.demandScore;
  const demandLikelihood = demand > 0.58 ? 0.76 : demand > 0.34 ? 0.48 : 0.22;
  const historyLikelihood = features.historical.pressure > 0.34 ? 0.64 : 0.3;
  const weatherLikelihood = features.environment.score > 0.45 ? 0.58 : 0.28;
  const routeLikelihood = features.route.score > 0.48 ? 0.52 : 0.26;

  return clamp(
    peakLikelihood * 0.24 +
      demandLikelihood * 0.28 +
      historyLikelihood * 0.22 +
      weatherLikelihood * 0.14 +
      routeLikelihood * 0.12
  );
}
