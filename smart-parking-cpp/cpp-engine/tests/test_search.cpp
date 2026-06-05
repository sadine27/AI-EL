// Edge case tests for search/optimization model
// Compile with: g++ -std=c++17 -I../include -I. test_search.cpp ../src/search_model.cpp ../src/ai_utils.cpp ../src/feature_extractor.cpp -o test_search

#define DOCTEST_CONFIG_IMPLEMENT
#include "doctest.h"
#include "search_model.h"
#include "feature_extractor.h"
#include "ai_utils.h"

using namespace parking;

TEST_CASE("searchOptimizationScore - default values") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    double result = searchOptimizationScore(fv);
    CHECK(result >= 0.0);
    CHECK(result <= 1.0);
}

TEST_CASE("searchOptimizationScore - zero occupancy") {
    FeatureVector fv = buildFeatureVector(10, 0, {}, {}, {}, {}, 12, 3);
    double result = searchOptimizationScore(fv);
    CHECK(result >= 0.0);
}

TEST_CASE("searchOptimizationScore - full occupancy") {
    FeatureVector fv = buildFeatureVector(10, 10, {}, {}, {}, {}, 12, 3);
    double result = searchOptimizationScore(fv);
    CHECK(result >= 0.0);
    CHECK(result <= 1.0);
}

TEST_CASE("searchOptimizationScore - extreme environment") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    fv.environmentScore = 1.0;
    fv.routeScore = 1.0;
    fv.demandScore = 1.0;
    double result = searchOptimizationScore(fv);
    CHECK(result >= 0.0);
    CHECK(result <= 1.0);
}

TEST_CASE("searchOptimizationScore - with places") {
    Place p;
    p.name = "Mall";
    p.type = "shopping_mall";
    p.open = true;
    p.rating = 4.5;
    p.reviewCount = 500;

    std::vector<Place> places = {p};
    FeatureVector fv = buildFeatureVector(10, 3, places, {}, {}, {}, 14, 6);
    double result = searchOptimizationScore(fv);
    CHECK(result >= 0.0);
    CHECK(result <= 1.0);
}

TEST_CASE("searchOptimizationScore - multiple places") {
    std::vector<Place> places;
    for (int i = 0; i < 10; i++) {
        Place p;
        p.name = "Place " + std::to_string(i);
        p.type = (i % 2 == 0) ? "restaurant" : "cafe";
        p.open = true;
        p.rating = 3.0 + (i % 3);
        p.reviewCount = 50 + i * 20;
        places.push_back(p);
    }

    FeatureVector fv = buildFeatureVector(10, 3, places, {}, {}, {}, 19, 5);
    double result = searchOptimizationScore(fv);
    CHECK(result >= 0.0);
    CHECK(result <= 1.0);
}

TEST_CASE("searchOptimizationScore - no places outside") {
    // With no places and night time, score should be low
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 3, 2);
    fv.demandScore = 0.08;  // Synthetic demand at 3am
    double result = searchOptimizationScore(fv);
    CHECK(result >= 0.0);
    CHECK(result <= 1.0);
}
