#include "decision_tree.h"

namespace parking {

std::pair<std::string, double> decisionTreeRisk(const FeatureVector& fv) {
    double demandScore = fv.demandScore;
    double liveOcc = fv.liveOccupancyRatio;
    double histPressure = fv.historicalPressure;
    double env = fv.environmentScore;
    double route = fv.routeScore;

    // Decision tree rules matching the JS implementation
    if (liveOcc >= 0.82)
        return {"Very high", 0.92};
    if (demandScore >= 0.72 && liveOcc >= 0.55)
        return {"High", 0.78};
    if (histPressure >= 0.44 && demandScore >= 0.5)
        return {"High", 0.72};
    if (env >= 0.5 && liveOcc >= 0.48)
        return {"High", 0.68};
    if (route >= 0.55 && demandScore >= 0.45)
        return {"Moderate", 0.58};
    if (demandScore >= 0.46 || liveOcc >= 0.42)
        return {"Moderate", 0.52};

    return {"Low", 0.24};
}

} // namespace parking
