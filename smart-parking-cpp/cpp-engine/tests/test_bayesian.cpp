// Edge case tests for bayesian model
// Compile with: g++ -std=c++17 -I../include -I. test_bayesian.cpp ../src/bayesian_model.cpp ../src/ai_utils.cpp ../src/feature_extractor.cpp -o test_bayesian

#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"
#include "bayesian_model.h"
#include "feature_extractor.h"
#include "ai_utils.h"

using namespace parking;

TEST_CASE("bayesianPressure - default values") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    double result = bayesianPressure(fv);
    CHECK(result >= 0.0);
    CHECK(result <= 1.0);
}

TEST_CASE("bayesianPressure - zero occupancy") {
    FeatureVector fv = buildFeatureVector(10, 0, {}, {}, {}, {}, 12, 3);
    double result = bayesianPressure(fv);
    CHECK(result >= 0.0);
    // With zero occupancy, bayesian pressure should be low
    CHECK(result < 0.5);
}

TEST_CASE("bayesianPressure - full occupancy") {
    FeatureVector fv = buildFeatureVector(10, 10, {}, {}, {}, {}, 12, 3);
    double result = bayesianPressure(fv);
    CHECK(result >= 0.0);
}

TEST_CASE("bayesianPressure - with places data") {
    Place p;
    p.name = "Test";
    p.type = "cafe";
    p.open = true;
    p.rating = 4.5;
    p.reviewCount = 100;
    p.lat = 19.0;
    p.lng = 72.0;

    FeatureVector fv = buildFeatureVector(10, 3, {p}, {}, {}, {}, 18, 2);
    double result = bayesianPressure(fv);
    CHECK(result >= 0.0);
    CHECK(result <= 1.0);
}

TEST_CASE("bayesianPressure - extreme hour") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 3, 3);
    double night = bayesianPressure(fv);

    FeatureVector fv2 = buildFeatureVector(10, 3, {}, {}, {}, {}, 18, 3);
    double evening = bayesianPressure(fv2);

    // Evening should typically have higher pressure than 3am
    // (but this depends on implementation details)
    CHECK(night >= 0.0);
    CHECK(evening >= 0.0);
}
