#ifndef AI_UTILS_H
#define AI_UTILS_H

#include <cmath>
#include <string>
#include <vector>
#include <unordered_set>

namespace parking {

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------
inline const std::unordered_set<int> WEEKDAY_COMMUTE_HOURS = {8, 9, 17, 18, 19};
inline const std::unordered_set<int> SHOPPING_PEAK_HOURS   = {12, 13, 18, 19, 20};

// ------------------------------------------------------------
// Utility functions
// ------------------------------------------------------------
inline double clamp(double value, double lo = 0.0, double hi = 1.0) {
    // NaN compares false against everything, so an unguarded clamp would let a
    // NaN flow straight through and silently poison every downstream score.
    // Treat non-finite input as the lower bound.
    if (!std::isfinite(value)) return lo;
    if (value < lo) return lo;
    if (value > hi) return hi;
    return value;
}

inline double sigmoid(double x) {
    return 1.0 / (1.0 + std::exp(-x));
}

// Guarded math helpers — return a safe 0.0 instead of producing inf/NaN on
// degenerate inputs (division by zero, log of a non-positive number). Used to
// keep the ensemble's ratio and log-likelihood terms finite.
inline double safe_divide(double numerator, double denominator) {
    if (!std::isfinite(numerator) || !std::isfinite(denominator)) return 0.0;
    return denominator == 0.0 ? 0.0 : numerator / denominator;
}

inline double safe_log(double value) {
    // value > 0.0 already rejects NaN (NaN > 0 is false); the isfinite guard
    // additionally rejects +inf, for which std::log would return +inf.
    return (std::isfinite(value) && value > 0.0) ? std::log(value) : 0.0;
}

inline bool isWeekend(int dayOfWeek) {
    return dayOfWeek == 0 || dayOfWeek == 6;
}

inline bool isPeakHour(int hour) {
    return WEEKDAY_COMMUTE_HOURS.count(hour) > 0 ||
           SHOPPING_PEAK_HOURS.count(hour) > 0;
}

// ------------------------------------------------------------
// Data structures
// ------------------------------------------------------------
struct GeoPoint {
    double lat = 0.0;
    double lng = 0.0;
};

struct Place {
    std::string name;
    std::string type;
    bool open = true;
    double rating = 0.0;
    int reviewCount = 0;
    double lat = 0.0;
    double lng = 0.0;
};

struct HistoricalRow {
    std::string key;
    int hour = 0;
    int day = 0;
    int weekend = 0;
    int peakHour = 0;
    double durationMinutes = 0.0;
    double occupiedShare = 0.0;
};

struct EnvironmentData {
    double precipitationProb = 0.0;
    double thunderstormProb = 0.0;
    double visibilityKm = 16.0;
    double cloudCover = 0.0;
    double windSpeed = 0.0;
    int aqi = 0;
    double pollenScore = 0.0;
};

struct RouteData {
    double distanceMeters = 0.0;
    double durationSeconds = 0.0;
    bool roadMatched = false;
};

struct FeatureVector {
    double nowTimestamp = 0.0;
    int hour = 12;
    int dayOfWeek = 0;
    int weekend = 0;
    int peakHour = 0;
    int totalSlots = 0;
    int unavailable = 0;
    int liveAvailable = 0;
    double liveOccupancyRatio = 0.0;
    double demandScore = 0.0;
    int placeCount = 0;
    int openPlaceCount = 0;
    double environmentScore = 0.0;
    double routeScore = 0.0;
    double historicalPressure = 0.0;
    int historicalRowCount = 0;
    std::vector<HistoricalRow> rows;
};

struct ModelScores {
    std::string decisionTreeLabel;
    double decisionTreeScore = 0.0;
    double bayes = 0.0;
    double instanceScore = 0.0;
    int instanceNeighbors = 0;
    double neural = 0.0;
    double environment = 0.0;
    double routeAccess = 0.0;
};

struct PredictionResult {
    int predictedAvailable = 0;
    int predictedOccupancyPct = 0;
    std::string riskLabel;
    int confidencePct = 0;
    double demandScore = 0.0;
    std::string demandLabel;
    ModelScores models;
};

} // namespace parking

#endif // AI_UTILS_H
