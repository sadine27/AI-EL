#include "bayesian_model.h"

namespace parking {

double bayesianPressure(const FeatureVector& fv) {
    double peakLikelihood = fv.peakHour ? 0.64 : 0.32;
    double demand = fv.demandScore;
    double demandLikelihood = (demand > 0.58) ? 0.76 :
                              (demand > 0.34) ? 0.48 : 0.22;
    double historyLikelihood = (fv.historicalPressure > 0.34) ? 0.64 : 0.30;
    double weatherLikelihood = (fv.environmentScore > 0.45) ? 0.58 : 0.28;
    double routeLikelihood = (fv.routeScore > 0.48) ? 0.52 : 0.26;

    return clamp(
        peakLikelihood * 0.24 +
        demandLikelihood * 0.28 +
        historyLikelihood * 0.22 +
        weatherLikelihood * 0.14 +
        routeLikelihood * 0.12
    );
}

} // namespace parking
