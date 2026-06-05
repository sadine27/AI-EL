// Edge case tests for instance-based learning (KNN)
// Compile with: g++ -std=c++17 -I../include -I. test_instance_learning.cpp ../src/instance_learning.cpp ../src/ai_utils.cpp ../src/feature_extractor.cpp -o test_instance_learning

#define DOCTEST_CONFIG_IMPLEMENT
#include "doctest.h"
#include "instance_learning.h"
#include "feature_extractor.h"
#include "ai_utils.h"

using namespace parking;

TEST_CASE("instanceBasedPressure - empty historical data") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    auto result = instanceBasedPressure(fv, 5);

    CHECK(result.score >= 0.0);
    CHECK(result.score <= 1.0);
    // With no historical neighbors, neighbors should be 0
    CHECK(result.neighbors == 0);
}

TEST_CASE("instanceBasedPressure - with historical data") {
    std::vector<HistoricalRow> historical;
    HistoricalRow hr;
    hr.hour = 12;
    hr.day = 3;
    hr.weekend = 0;
    hr.peakHour = 1;
    hr.durationMinutes = 45.0;
    hr.occupiedShare = 0.5;
    hr.key = "3-12";
    historical.push_back(hr);

    HistoricalRow hr2;
    hr2.hour = 13;
    hr2.day = 3;
    hr2.weekend = 0;
    hr2.peakHour = 1;
    hr2.durationMinutes = 60.0;
    hr2.occupiedShare = 0.7;
    hr2.key = "3-13";
    historical.push_back(hr2);

    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, historical, 12, 3);
    auto result = instanceBasedPressure(fv, 5);

    CHECK(result.score >= 0.0);
    CHECK(result.score <= 1.0);
    CHECK(result.neighbors >= 0);
}

TEST_CASE("instanceBasedPressure - different k values") {
    std::vector<HistoricalRow> historical;
    for (int h = 8; h <= 20; h++) {
        HistoricalRow hr;
        hr.hour = h;
        hr.day = 3;
        hr.weekend = 0;
        hr.peakHour = (h >= 17 && h <= 19) ? 1 : 0;
        hr.durationMinutes = 45.0;
        hr.occupiedShare = 0.5;
        hr.key = "3-" + std::to_string(h);
        historical.push_back(hr);
    }

    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, historical, 12, 3);

    auto result_k1 = instanceBasedPressure(fv, 1);
    auto result_k3 = instanceBasedPressure(fv, 3);
    auto result_k10 = instanceBasedPressure(fv, 10);

    CHECK(result_k1.score >= 0.0);
    CHECK(result_k3.score >= 0.0);
    CHECK(result_k10.score >= 0.0);

    // With more neighbors, we should have more matches
    CHECK(result_k1.neighbors <= result_k10.neighbors);
}

TEST_CASE("instanceBasedPressure - k=0") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    auto result = instanceBasedPressure(fv, 0);

    CHECK(result.score >= 0.0);
    CHECK(result.score <= 1.0);
}

TEST_CASE("instanceBasedPressure - extreme occupancy in history") {
    std::vector<HistoricalRow> historical;
    HistoricalRow hr;
    hr.hour = 12;
    hr.day = 3;
    hr.weekend = 0;
    hr.peakHour = 1;
    hr.durationMinutes = 120.0;
    hr.occupiedShare = 1.0;  // Full occupancy
    hr.key = "3-12";
    historical.push_back(hr);

    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, historical, 12, 3);
    auto result = instanceBasedPressure(fv, 3);

    CHECK(result.score >= 0.0);
    CHECK(result.score <= 1.0);
}
