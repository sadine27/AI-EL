// Edge case tests for decision tree model
// Compile with: g++ -std=c++17 -I../include -I. test_decision_tree.cpp ../src/decision_tree.cpp ../src/ai_utils.cpp ../src/feature_extractor.cpp -o test_decision_tree

#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"
#include "decision_tree.h"
#include "feature_extractor.h"
#include "ai_utils.h"

using namespace parking;

FeatureVector make_test_fv(double liveOcc, double demand = 0.3, double envScore = 0.0,
                           double routeScore = 0.0, double histPressure = 0.0,
                           int total = 10, int unavail = 3, int hour = 12, int day = 3) {
    std::vector<Place> places;
    EnvironmentData env;
    RouteData route;
    std::vector<HistoricalRow> historical;

    FeatureVector fv = buildFeatureVector(total, unavail, places, env, route, historical, hour, day);
    fv.liveOccupancyRatio = liveOcc;
    fv.demandScore = demand;
    fv.environmentScore = envScore;
    fv.routeScore = routeScore;
    fv.historicalPressure = histPressure;
    return fv;
}

TEST_CASE("decisionTreeRisk - empty parking") {
    auto [label, score] = decisionTreeRisk(make_test_fv(0.0, 0.1));
    CHECK(label == "Low");
    CHECK(score >= 0.0);
}

TEST_CASE("decisionTreeRisk - fully occupied") {
    auto [label, score] = decisionTreeRisk(make_test_fv(1.0, 0.9));
    CHECK(score >= 0.0);
    CHECK(score <= 1.0);
}

TEST_CASE("decisionTreeRisk - moderate occupancy") {
    auto [label, score] = decisionTreeRisk(make_test_fv(0.45, 0.5));
    CHECK(score >= 0.0);
    CHECK(score <= 1.0);
}

TEST_CASE("decisionTreeRisk - extreme values") {
    auto [label, score] = decisionTreeRisk(make_test_fv(5.0, 10.0));
    CHECK(score >= 0.0);
    CHECK(score <= 1.0);

    auto [label2, score2] = decisionTreeRisk(make_test_fv(-1.0, -1.0));
    CHECK(score2 >= 0.0);
    CHECK(score2 <= 1.0);
}

TEST_CASE("decisionTreeRisk - zero slots") {
    FeatureVector fv;
    fv.totalSlots = 0;
    fv.liveOccupancyRatio = 0.0;
    fv.demandScore = 0.0;
    fv.environmentScore = 0.0;
    fv.routeScore = 0.0;
    fv.historicalPressure = 0.0;

    auto [label, score] = decisionTreeRisk(fv);
    CHECK(!label.empty());
    CHECK(score >= 0.0);
}
