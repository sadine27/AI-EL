#include "feature_extractor.h"
#include <algorithm>
#include <cmath>
#include <cctype>

namespace parking {

double getTypeWeight(const std::string& type) {
    if (type == "shopping_mall")     return TYPE_WEIGHT_SHOPPING_MALL;
    if (type == "department_store")  return TYPE_WEIGHT_DEPT_STORE;
    if (type == "supermarket")       return TYPE_WEIGHT_SUPERMARKET;
    if (type == "restaurant")        return TYPE_WEIGHT_RESTAURANT;
    if (type == "cafe")              return TYPE_WEIGHT_CAFE;
    if (type == "movie_theater")     return TYPE_WEIGHT_MOVIE_THEATER;
    if (type == "store")             return TYPE_WEIGHT_STORE;
    if (type == "hospital")          return TYPE_WEIGHT_HOSPITAL;
    if (type == "school")            return TYPE_WEIGHT_SCHOOL;
    if (type == "tourist_attraction") return TYPE_WEIGHT_TOURIST_ATTR;
    return 0.72;
}

double typeHourFactor(const std::string& type, int hour, int day) {
    bool weekend = (day == 0 || day == 6);
    if (type == "school")
        return (hour >= 8 && hour <= 15 && !weekend) ? 1.08 : 0.18;
    if (type == "hospital")
        return 0.74;
    if (type == "movie_theater")
        return (hour >= 17 && hour <= 23) ? 1.18 : 0.28;
    if (type == "restaurant" || type == "cafe") {
        if (hour == 8 || hour == 9 || hour == 12 || hour == 13 ||
            hour == 19 || hour == 20 || hour == 21)
            return 1.12;
        return (hour >= 10 && hour <= 22) ? 0.72 : 0.18;
    }
    if (type == "shopping_mall" || type == "department_store" ||
        type == "store" || type == "supermarket") {
        if (weekend && hour >= 11 && hour <= 21) return 1.18;
        if (SHOPPING_PEAK_HOURS.count(hour)) return 1.0;
        return (hour >= 10 && hour <= 22) ? 0.64 : 0.14;
    }
    return (hour >= 9 && hour <= 21) ? 0.62 : 0.18;
}

double ratingFactor(double rating) {
    if (!std::isfinite(rating) || rating <= 0) return 1.0;
    return clamp(0.72 + rating / 10.0, 0.78, 1.22);
}

double reviewVolumeFactor(int count) {
    if (count <= 0) return 0.55;
    return clamp(std::log10(static_cast<double>(count) + 1.0) / 3.0, 0.35, 1.20);
}

bool isPlaceOpen(const Place& place, int day, int hour, int /*minute*/) {
    // Simplified: assume open if it has a rating
    // In production, parse opening_hours from API
    return place.open;
}

double syntheticDemand(int hour, int dayOfWeek) {
    bool weekend = (dayOfWeek == 0 || dayOfWeek == 6);
    double demand = 0.28;
    if (WEEKDAY_COMMUTE_HOURS.count(hour) && !weekend) demand += 0.18;
    if (SHOPPING_PEAK_HOURS.count(hour)) demand += 0.22;
    if (weekend && hour >= 11 && hour <= 21) demand += 0.20;
    if (hour >= 22 || hour <= 6) demand -= 0.16;
    return clamp(demand, 0.08, 0.78);
}

double computeDemandScore(const std::vector<Place>& places, int hour, int dayOfWeek, int minute) {
    if (places.empty()) {
        return syntheticDemand(hour, dayOfWeek);
    }

    double totalScore = 0.0;
    for (const auto& place : places) {
        double tw = getTypeWeight(place.type);
        double tf = typeHourFactor(place.type, hour, dayOfWeek);
        double rf = ratingFactor(place.rating);
        double rvf = reviewVolumeFactor(place.reviewCount);
        double openFactor = place.open ? 1.0 : 0.16;
        totalScore += tw * tf * rf * rvf * openFactor;
    }

    double n = static_cast<double>(places.size());
    double demand = totalScore / std::max(4.5, n * 0.92);
    return clamp(demand, 0.04, 0.96);
}

double weatherPenalty(const EnvironmentData& env) {
    return clamp(
        env.precipitationProb * 0.38 +
        env.thunderstormProb * 0.32 +
        clamp((8.0 - env.visibilityKm) / 8.0) * 0.12 +
        env.cloudCover * 0.06 +
        clamp(env.windSpeed / 45.0) * 0.12
    );
}

double computeEnvironmentScore(const EnvironmentData& env) {
    double w = weatherPenalty(env);
    double aqiScore = (env.aqi > 0) ? clamp(static_cast<double>(env.aqi - 40) / 180.0, 0.0, 1.0) : 0.0;
    double pollen = clamp(env.pollenScore / 5.0);
    return clamp(w * 0.58 + aqiScore * 0.28 + pollen * 0.14);
}

double computeRouteScore(const RouteData& route) {
    return clamp(
        (route.distanceMeters / 5000.0) * 0.55 +
        (route.durationSeconds / 900.0) * 0.35 +
        (route.roadMatched ? 0.0 : 0.1)
    );
}

double computeHistoricalPressure(const std::vector<HistoricalRow>& rows, int targetHour, int targetDay) {
    if (rows.empty()) return 0.0;

    // Find exact hour+day matches, or close matches
    double totalPressure = 0.0;

    for (const auto& row : rows) {
        bool match = (row.key == std::to_string(targetDay) + "-" + std::to_string(targetHour)) ||
                     (std::abs(row.hour - targetHour) <= 1) ||
                     (row.day == targetDay);
        if (match) {
            double durationFactor = clamp(row.durationMinutes / 90.0, 0.35, 1.45);
            totalPressure += row.occupiedShare * durationFactor;
        }
    }

    return clamp(totalPressure, 0.0, 0.92);
}

FeatureVector buildFeatureVector(
    int totalSlots, int unavailable,
    const std::vector<Place>& places,
    const EnvironmentData& env,
    const RouteData& route,
    const std::vector<HistoricalRow>& historical,
    int hour, int dayOfWeek)
{
    FeatureVector fv;
    fv.hour = hour;
    fv.dayOfWeek = dayOfWeek;
    fv.weekend = isWeekend(dayOfWeek) ? 1 : 0;
    fv.peakHour = isPeakHour(hour) ? 1 : 0;
    fv.totalSlots = totalSlots;
    fv.unavailable = unavailable;
    fv.liveAvailable = totalSlots - unavailable;
    fv.liveOccupancyRatio = (totalSlots > 0) ?
        static_cast<double>(unavailable) / static_cast<double>(totalSlots) : 0.0;
    fv.demandScore = computeDemandScore(places, hour, dayOfWeek, 0);
    fv.placeCount = static_cast<int>(places.size());
    fv.openPlaceCount = static_cast<int>(
        std::count_if(places.begin(), places.end(), [](const Place& p) { return p.open; })
    );
    fv.environmentScore = computeEnvironmentScore(env);
    fv.routeScore = computeRouteScore(route);
    fv.historicalPressure = computeHistoricalPressure(historical, hour, dayOfWeek);
    fv.historicalRowCount = static_cast<int>(historical.size());
    fv.rows = historical;
    return fv;
}

} // namespace parking
