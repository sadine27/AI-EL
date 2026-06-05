import { clamp } from "./ai-utils.js";

export function buildResponsibleExplanation(features, modelScores) {
  const catalog = features.apiCatalog || [];
  const liveApis = catalog.filter((api) => api.status === "ready").map((api) => api.name);
  const contextApis = catalog.filter((api) => ["context", "derived"].includes(api.status)).length;
  const failedApis = catalog.filter((api) => api.status === "error");
  const dataCompleteness = clamp(
    0.32 +
      Math.min(features.nearbyDemand.placeCount, 8) * 0.035 +
      Math.min(features.historical.rowCount, 12) * 0.016 +
      Math.min(features.readyApiCount, 8) * 0.035 +
      (features.totalSlots ? 0.16 : 0) -
      Math.min(failedApis.length, 4) * 0.025
  );

  return {
    confidencePct: Math.round(dataCompleteness * 100),
    apiUse: {
      totalEnabledApisRepresented: catalog.length || 33,
      liveApisUsed: liveApis,
      liveApiCount: liveApis.length,
      contextApiCount: contextApis,
      failedApiCount: failedApis.length,
      failedApis: failedApis.slice(0, 4).map((api) => `${api.name}: ${api.error}`)
    },
    summary:
      `Prediction uses live occupancy, nearby demand, history, environment, route access, and ${liveApis.length} live Google API signals.`,
    safeguards: [
      "Exact Google popular-times data is not assumed because it is not exposed as a public Places field.",
      "Unavailable APIs reduce confidence instead of breaking the local model.",
      "The model returns explanation scores so a human can challenge the prediction."
    ],
    modelScores
  };
}
