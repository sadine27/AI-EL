#include "search_model.h"
#include <cmath>
#include <algorithm>
#include <limits>

namespace parking {

// Haversine distance in meters
static double haversineDistance(const GeoPoint& a, const GeoPoint& b) {
    const double R = 6371000.0; // Earth radius in meters
    double dLat = (b.lat - a.lat) * M_PI / 180.0;
    double dLng = (b.lng - a.lng) * M_PI / 180.0;
    double lat1 = a.lat * M_PI / 180.0;
    double lat2 = b.lat * M_PI / 180.0;
    double h = std::sin(dLat / 2.0) * std::sin(dLat / 2.0) +
               std::cos(lat1) * std::cos(lat2) *
               std::sin(dLng / 2.0) * std::sin(dLng / 2.0);
    double c = 2.0 * std::atan2(std::sqrt(h), std::sqrt(1.0 - h));
    return R * c;
}

// A* heuristic: parkingCost = distanceCost + travelTimeCost + predictedOccupancyCost + nearbyDemandCost + weatherPenalty
double heuristicCost(const FeatureVector& features, const GeoPoint& slotCenter, const GeoPoint& areaCenter) {
    double distanceMeters = haversineDistance(slotCenter, areaCenter);
    double maxRadius = 80.0; // Default area radius
    double distanceCost = clamp(distanceMeters / maxRadius, 0.0, 1.0);
    double occupancyCost = features.liveOccupancyRatio;
    double demandCost = features.demandScore;
    double envCost = features.environmentScore;

    // Total cost: lower is better
    return distanceCost * 0.25 + occupancyCost * 0.30 + demandCost * 0.25 + envCost * 0.20;
}

std::vector<SlotCandidate> rankSlots(const FeatureVector& features,
                                     const std::vector<GeoPoint>& slotCenters,
                                     const GeoPoint& areaCenter,
                                     int topN) {
    std::vector<SlotCandidate> candidates;
    for (int i = 0; i < (int)slotCenters.size(); ++i) {
        double h = heuristicCost(features, slotCenters[i], areaCenter);
        candidates.push_back({i, 0.0, h, h});
    }

    // Sort by heuristic (lower is better)
    std::sort(candidates.begin(), candidates.end(),
              [](const SlotCandidate& a, const SlotCandidate& b) {
                  return a.heuristic < b.heuristic;
              });

    if ((int)candidates.size() > topN)
        candidates.resize(topN);

    return candidates;
}

} // namespace parking
