#ifndef SEARCH_MODEL_H
#define SEARCH_MODEL_H

#include "ai_utils.h"
#include <vector>
#include <utility>

namespace parking {

struct SlotCandidate {
    int slotIndex = 0;
    double cost = 0.0;
    double heuristic = 0.0;
    double totalCost = 0.0;
};

// A* style heuristic to rank parking slots
double heuristicCost(const FeatureVector& features, const GeoPoint& slotCenter, const GeoPoint& areaCenter);
std::vector<SlotCandidate> rankSlots(const FeatureVector& features,
                                     const std::vector<GeoPoint>& slotCenters,
                                     const GeoPoint& areaCenter,
                                     int topN = 5);

} // namespace parking

#endif // SEARCH_MODEL_H
