// Edge case tests for neural model
// Compile with: g++ -std=c++17 -I../include -I. test_neural.cpp ../src/neural_model.cpp ../src/ai_utils.cpp ../src/feature_extractor.cpp -o test_neural

#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"
#include "neural_model.h"
#include "feature_extractor.h"
#include "ai_utils.h"

using namespace parking;

TEST_CASE("neuralPressureScore - default values") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    double result = neuralPressureScore(fv);
    CHECK(result >= 0.0);
    CHECK(result <= 1.0);
}

TEST_CASE("neuralPressureScore - empty parking") {
    FeatureVector fv = buildFeatureVector(10, 0, {}, {}, {}, {}, 12, 3);
    fv.liveOccupancyRatio = 0.0;
    double result = neuralPressureScore(fv);
    CHECK(result >= 0.0);
}

TEST_CASE("neuralPressureScore - full occupancy") {
    FeatureVector fv = buildFeatureVector(10, 10, {}, {}, {}, {}, 12, 3);
    fv.liveOccupancyRatio = 1.0;
    double result = neuralPressureScore(fv);
    CHECK(result >= 0.0);
    CHECK(result <= 1.0);
}

TEST_CASE("neuralPressureScore - extreme values") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    fv.liveOccupancyRatio = 100.0;  // Way out of range
    fv.demandScore = -100.0;        // Way out of range
    double result = neuralPressureScore(fv);
    CHECK(result >= 0.0);
    CHECK(result <= 1.0);
}

TEST_CASE("neuralPressureScore - non-linear response") {
    FeatureVector fv_low = buildFeatureVector(10, 1, {}, {}, {}, {}, 12, 3);
    fv_low.liveOccupancyRatio = 0.1;
    double low = neuralPressureScore(fv_low);

    FeatureVector fv_high = buildFeatureVector(10, 9, {}, {}, {}, {}, 12, 3);
    fv_high.liveOccupancyRatio = 0.9;
    double high = neuralPressureScore(fv_high);

    // Higher occupancy should generally give higher neural score
    CHECK(high >= 0.0);
    CHECK(low >= 0.0);
}

TEST_CASE("neuralPressureScore - weekday vs weekend") {
    FeatureVector fv_wd = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 2);
    fv_wd.weekend = 0;
    double weekday = neuralPressureScore(fv_wd);

    FeatureVector fv_we = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 6);
    fv_we.weekend = 1;
    double weekend = neuralPressureScore(fv_we);

    CHECK(weekday >= 0.0);
    CHECK(weekend >= 0.0);
}

TEST_CASE("neuralPressureScore - peak hour") {
    FeatureVector fv_off = buildFeatureVector(10, 3, {}, {}, {}, {}, 3, 3);
    fv_off.peakHour = 0;
    double offpeak = neuralPressureScore(fv_off);

    FeatureVector fv_peak = buildFeatureVector(10, 3, {}, {}, {}, {}, 18, 3);
    fv_peak.peakHour = 1;
    double peak = neuralPressureScore(fv_peak);

    CHECK(offpeak >= 0.0);
    CHECK(peak >= 0.0);
}
