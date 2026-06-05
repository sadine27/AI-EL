#ifndef FEATURE_EXTRACTOR_H
#define FEATURE_EXTRACTOR_H

#include "ai_utils.h"
#include <vector>
#include <string>

namespace parking {

// Type weights for place demand
inline const double TYPE_WEIGHT_SHOPPING_MALL     = 1.65;
inline const double TYPE_WEIGHT_DEPT_STORE        = 1.35;
inline const double TYPE_WEIGHT_SUPERMARKET       = 1.18;
inline const double TYPE_WEIGHT_RESTAURANT        = 1.24;
inline const double TYPE_WEIGHT_CAFE              = 1.00;
inline const double TYPE_WEIGHT_MOVIE_THEATER     = 1.42;
inline const double TYPE_WEIGHT_STORE             = 0.88;
inline const double TYPE_WEIGHT_HOSPITAL          = 0.82;
inline const double TYPE_WEIGHT_SCHOOL            = 0.76;
inline const double TYPE_WEIGHT_TOURIST_ATTR      = 1.20;

double getTypeWeight(const std::string& type);
double typeHourFactor(const std::string& type, int hour, int day);
double ratingFactor(double rating);
double reviewVolumeFactor(int count);
bool isPlaceOpen(const Place& place, int day, int hour, int minute);
double syntheticDemand(int hour, int dayOfWeek);
double computeDemandScore(const std::vector<Place>& places, int hour, int dayOfWeek, int minute);
double weatherPenalty(const EnvironmentData& env);
double computeEnvironmentScore(const EnvironmentData& env);
double computeRouteScore(const RouteData& route);
double computeHistoricalPressure(const std::vector<HistoricalRow>& rows, int targetHour, int targetDay);
FeatureVector buildFeatureVector(
    int totalSlots, int unavailable,
    const std::vector<Place>& places,
    const EnvironmentData& env,
    const RouteData& route,
    const std::vector<HistoricalRow>& historical,
    int hour, int dayOfWeek
);

} // namespace parking

#endif // FEATURE_EXTRACTOR_H
