import { bayesianPressure } from "./bayesian-model.js";
import { clamp } from "./ai-utils.js";
import { decisionTreeRisk } from "./decision-tree-model.js";
import { buildFeatureVector } from "./feature-extractor.js";
import { fetchNearbyPlacesDemand, fetchParkingContextSignals, GOOGLE_MAPS_API_CATALOG } from "./google-signals.js";
import { instanceBasedPressure } from "./instance-learning-model.js";
import { neuralPressureScore } from "./neural-score-model.js";
import { buildResponsibleExplanation } from "./responsible-ai.js";
import { recommendSlots } from "./search-model.js";

export { fetchNearbyPlacesDemand, fetchParkingContextSignals, GOOGLE_MAPS_API_CATALOG };

export function buildParkingAvailabilityPrediction(area, slots, logs, options = {}) {
  const features = buildFeatureVector(area, slots, logs, options);
  const decisionTree = decisionTreeRisk(features);
  const bayes = bayesianPressure(features);
  const instance = instanceBasedPressure(features);
  const neural = neuralPressureScore(features);

  const predictedOccupancyRatio = clamp(
    features.liveOccupancyRatio * 0.32 +
      features.nearbyDemand.demandScore * 0.2 +
      features.historical.pressure * 0.14 +
      features.environment.score * 0.09 +
      features.route.score * 0.08 +
      decisionTree.score * 0.07 +
      bayes * 0.04 +
      instance.score * 0.03 +
      neural * 0.03
  );

  const predictedAvailable = Math.max(
    0,
    Math.min(features.totalSlots, Math.round(features.totalSlots * (1 - predictedOccupancyRatio)))
  );
  const modelScores = {
    decisionTree: decisionTree.label,
    decisionTreeScore: Math.round(decisionTree.score * 100),
    bayes: Math.round(bayes * 100),
    instance: Math.round(instance.score * 100),
    instanceNeighbors: instance.neighbors,
    neural: Math.round(neural * 100),
    environment: Math.round(features.environment.score * 100),
    routeAccess: Math.round(features.route.score * 100)
  };
  const responsibleAi = buildResponsibleExplanation(features, modelScores);

  return {
    generatedAt: features.now.toISOString(),
    horizonMinutes: 30,
    liveAvailable: features.liveAvailable,
    predictedAvailable,
    predictedOccupancyPct: Math.round(predictedOccupancyRatio * 100),
    riskLabel: decisionTree.label,
    confidencePct: responsibleAi.confidencePct,
    demandScore: features.nearbyDemand.demandScore,
    demandLabel: features.nearbyDemand.demandScore >= 0.7 ? "Heavy" : features.nearbyDemand.demandScore >= 0.42 ? "Moderate" : "Light",
    demandSignal: features.nearbyDemand,
    historical: features.historical,
    environment: features.environment,
    route: features.route,
    modelBreakdown: modelScores,
    responsibleAi,
    apiCatalog: features.apiCatalog,
    recommendedSlots: recommendSlots(area, slots, features)
  };
}
