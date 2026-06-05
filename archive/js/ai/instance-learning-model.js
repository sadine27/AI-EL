import { clamp } from "./ai-utils.js";

function similarity(row, features) {
  const hourDistance = Math.min(Math.abs(row.hour - features.now.getHours()), 24 - Math.abs(row.hour - features.now.getHours())) / 12;
  const sameDay = row.day === features.now.getDay() ? 0 : 0.2;
  const weekendDistance = Math.abs(row.weekend - features.weekend) * 0.16;
  const peakDistance = Math.abs(row.peakHour - features.peakHour) * 0.14;
  const distance = hourDistance * 0.5 + sameDay + weekendDistance + peakDistance;
  return clamp(1 - distance, 0, 1);
}

export function instanceBasedPressure(features, k = 5) {
  const rows = features.historical.rows || [];
  if (!rows.length) {
    return {
      score: clamp(features.liveOccupancyRatio * 0.6 + features.nearbyDemand.demandScore * 0.4),
      neighbors: 0
    };
  }

  const nearest = rows
    .map((row) => ({
      row,
      similarity: similarity(row, features)
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);

  const weightedTotal = nearest.reduce((sum, item) => sum + item.row.occupiedShare * (0.4 + item.similarity), 0);
  const totalWeight = nearest.reduce((sum, item) => sum + 0.4 + item.similarity, 0);

  return {
    score: clamp(totalWeight ? weightedTotal / totalWeight * 6 : 0),
    neighbors: nearest.length
  };
}
