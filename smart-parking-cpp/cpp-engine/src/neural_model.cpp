#include "neural_model.h"

namespace parking {

double neuralPressureScore(const FeatureVector& fv) {
    double z =
        -1.35 +
        fv.liveOccupancyRatio * 1.75 +
        fv.demandScore * 1.28 +
        fv.historicalPressure * 1.05 +
        fv.environmentScore * 0.62 +
        fv.routeScore * 0.42 +
        static_cast<double>(fv.weekend) * 0.18 +
        static_cast<double>(fv.peakHour) * 0.32;
    return sigmoid(z);
}

} // namespace parking
