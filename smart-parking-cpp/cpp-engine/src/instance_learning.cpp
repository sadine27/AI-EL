#include "instance_learning.h"
#include <algorithm>
#include <cmath>

namespace parking {

double similarity(const HistoricalRow& row, const FeatureVector& features) {
    double hourDistance = std::min(
        std::abs(static_cast<double>(row.hour) - static_cast<double>(features.hour)),
        24.0 - std::abs(static_cast<double>(row.hour) - static_cast<double>(features.hour))
    ) / 12.0;

    double sameDay = (row.day == features.dayOfWeek) ? 0.0 : 0.2;
    double weekendDistance = std::abs(row.weekend - features.weekend) * 0.16;
    double peakDistance = std::abs(row.peakHour - features.peakHour) * 0.14;

    double distance = hourDistance * 0.5 + sameDay + weekendDistance + peakDistance;
    return clamp(1.0 - distance, 0.0, 1.0);
}

InstanceResult instanceBasedPressure(const FeatureVector& features, int k) {
    const auto& rows = features.rows;
    if (rows.empty()) {
        return {
            clamp(features.liveOccupancyRatio * 0.6 + features.demandScore * 0.4),
            0
        };
    }

    // Compute similarity for all rows
    std::vector<std::pair<double, const HistoricalRow*>> scored;
    for (const auto& row : rows) {
        double sim = similarity(row, features);
        scored.push_back({sim, &row});
    }

    // Sort by similarity descending, take top k
    std::partial_sort(scored.begin(),
                      scored.begin() + std::min(k, (int)scored.size()),
                      scored.end(),
                      [](const auto& a, const auto& b) { return a.first > b.first; });

    int actualK = std::min(k, (int)scored.size());
    double weightedTotal = 0.0;
    double totalWeight = 0.0;

    for (int i = 0; i < actualK; ++i) {
        double sim = scored[i].first;
        double occ = scored[i].second->occupiedShare;
        weightedTotal += occ * (0.4 + sim);
        totalWeight += 0.4 + sim;
    }

    InstanceResult result;
    result.score = (totalWeight > 0) ?
        clamp((weightedTotal / totalWeight) * 6.0) : 0.0;
    result.neighbors = actualK;
    return result;
}

} // namespace parking
