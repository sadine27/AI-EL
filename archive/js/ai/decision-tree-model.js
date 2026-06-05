export function decisionTreeRisk(features) {
  const demandScore = features.nearbyDemand.demandScore;
  const liveOccupancyRatio = features.liveOccupancyRatio;
  const historicalPressure = features.historical.pressure;
  const environment = features.environment.score;
  const routeAccess = features.route.score;

  if (liveOccupancyRatio >= 0.82) return { label: "Very high", score: 0.92 };
  if (demandScore >= 0.72 && liveOccupancyRatio >= 0.55) return { label: "High", score: 0.78 };
  if (historicalPressure >= 0.44 && demandScore >= 0.5) return { label: "High", score: 0.72 };
  if (environment >= 0.5 && liveOccupancyRatio >= 0.48) return { label: "High", score: 0.68 };
  if (routeAccess >= 0.55 && demandScore >= 0.45) return { label: "Moderate", score: 0.58 };
  if (demandScore >= 0.46 || liveOccupancyRatio >= 0.42) return { label: "Moderate", score: 0.52 };
  return { label: "Low", score: 0.24 };
}
