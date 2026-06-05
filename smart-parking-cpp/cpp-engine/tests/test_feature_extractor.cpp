// Edge case tests for feature extractor
// Compile with: g++ -std=c++17 -I../include -I. test_feature_extractor.cpp ../src/feature_extractor.cpp ../src/ai_utils.cpp -o test_feature_extractor

#define DOCTEST_CONFIG_IMPLEMENT
#include "doctest.h"
#include "feature_extractor.h"
#include "ai_utils.h"

using namespace parking;

TEST_CASE("buildFeatureVector with empty places") {
    std::vector<Place> places;
    EnvironmentData env;
    RouteData route;
    std::vector<HistoricalRow> historical;

    FeatureVector fv = buildFeatureVector(10, 3, places, env, route, historical, 12, 3);

    CHECK(fv.totalSlots == 10);
    CHECK(fv.unavailable == 3);
    CHECK(fv.liveAvailable == 7);
    CHECK(fv.hour == 12);
    CHECK(fv.dayOfWeek == 3);
    CHECK(fv.placeCount == 0);
    CHECK(fv.demandScore >= 0.0);
    CHECK(fv.liveOccupancyRatio == doctest::Approx(0.3));
}

TEST_CASE("buildFeatureVector with zero totalSlots") {
    std::vector<Place> places;
    EnvironmentData env;
    RouteData route;
    std::vector<HistoricalRow> historical;

    FeatureVector fv = buildFeatureVector(0, 0, places, env, route, historical, 12, 3);

    // Should handle gracefully without division by zero
    CHECK(fv.totalSlots >= 0);
    CHECK(fv.liveOccupancyRatio >= 0.0);
}

TEST_CASE("buildFeatureVector with max occupancy") {
    std::vector<Place> places;
    EnvironmentData env;
    RouteData route;
    std::vector<HistoricalRow> historical;

    FeatureVector fv = buildFeatureVector(10, 10, places, env, route, historical, 12, 3);

    CHECK(fv.unavailable == 10);
    CHECK(fv.liveAvailable == 0);
    CHECK(fv.liveOccupancyRatio == doctest::Approx(1.0));
}

TEST_CASE("buildFeatureVector with zero occupancy") {
    std::vector<Place> places;
    EnvironmentData env;
    RouteData route;
    std::vector<HistoricalRow> historical;

    FeatureVector fv = buildFeatureVector(10, 0, places, env, route, historical, 12, 3);

    CHECK(fv.unavailable == 0);
    CHECK(fv.liveAvailable == 10);
    CHECK(fv.liveOccupancyRatio == doctest::Approx(0.0));
}

TEST_CASE("buildFeatureVector hour and day clamping") {
    std::vector<Place> places;
    EnvironmentData env;
    RouteData route;
    std::vector<HistoricalRow> historical;

    FeatureVector fv = buildFeatureVector(10, 3, places, env, route, historical, 25, 7);
    // Day 7 -> should be clamped to 6 (Saturday)
    CHECK(fv.dayOfWeek == 6);

    FeatureVector fv2 = buildFeatureVector(10, 3, places, env, route, historical, -1, -1);
    // Day -1 -> should be clamped to 0
    CHECK(fv2.dayOfWeek == 0);
}

TEST_CASE("buildFeatureVector with extreme environment") {
    std::vector<Place> places;
    EnvironmentData env;
    env.precipitationProb = 1.5;  // > 1.0
    env.thunderstormProb = -0.5;  // < 0
    env.visibilityKm = -1.0;      // negative
    env.cloudCover = 2.0;         // > 1.0
    env.windSpeed = 500.0;        // extreme
    env.aqi = 999999;
    env.pollenScore = 999999.0;
    RouteData route;
    std::vector<HistoricalRow> historical;

    FeatureVector fv = buildFeatureVector(10, 3, places, env, route, historical, 12, 3);

    // Should not crash, all values should be within valid range
    CHECK(fv.environmentScore >= 0.0);
    CHECK(fv.environmentScore <= 1.0);
}

TEST_CASE("buildFeatureVector with extreme route") {
    std::vector<Place> places;
    EnvironmentData env;
    RouteData route;
    route.distanceMeters = -500.0;   // negative
    route.durationSeconds = -100.0;  // negative
    std::vector<HistoricalRow> historical;

    FeatureVector fv = buildFeatureVector(10, 3, places, env, route, historical, 12, 3);

    CHECK(fv.routeScore >= 0.0);
    CHECK(fv.routeScore <= 1.0);
}
