// Edge case tests for the A* slot-ranking search model.
// Compile with: g++ -std=c++17 -I../include -I. test_search.cpp ../src/search_model.cpp ../src/ai_utils.cpp ../src/feature_extractor.cpp -o test_search

#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"
#include "search_model.h"
#include "feature_extractor.h"
#include "ai_utils.h"

using namespace parking;

// heuristicCost blends distance/occupancy/demand/environment, each clamped to
// [0,1] with weights summing to 1.0, so the result must also stay within [0,1].
TEST_CASE("heuristicCost stays within [0,1] for default features") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    GeoPoint slot{19.0760, 72.8777};
    GeoPoint area{19.0760, 72.8777};  // same point -> zero distance
    double cost = heuristicCost(fv, slot, area);
    CHECK(cost >= 0.0);
    CHECK(cost <= 1.0);
}

TEST_CASE("heuristicCost is lower for a closer slot") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    GeoPoint area{19.0760, 72.8777};
    GeoPoint nearSlot{19.0760, 72.8777};     // coincident
    GeoPoint farSlot{19.0800, 72.8820};      // a few hundred metres away
    CHECK(heuristicCost(fv, nearSlot, area) <= heuristicCost(fv, farSlot, area));
}

TEST_CASE("heuristicCost grows with occupancy") {
    GeoPoint slot{19.0760, 72.8777};
    GeoPoint area{19.0760, 72.8777};
    FeatureVector empty = buildFeatureVector(10, 0, {}, {}, {}, {}, 12, 3);
    FeatureVector full  = buildFeatureVector(10, 10, {}, {}, {}, {}, 12, 3);
    CHECK(heuristicCost(full, slot, area) >= heuristicCost(empty, slot, area));
}

TEST_CASE("heuristicCost handles extreme feature values without escaping range") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    fv.environmentScore = 1.0;
    fv.demandScore = 1.0;
    fv.liveOccupancyRatio = 1.0;
    GeoPoint slot{19.0760, 72.8777};
    GeoPoint area{19.0760, 72.8777};
    double cost = heuristicCost(fv, slot, area);
    CHECK(cost >= 0.0);
    CHECK(cost <= 1.0);
}

TEST_CASE("rankSlots returns sorted candidates capped at topN") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    GeoPoint area{19.0760, 72.8777};
    std::vector<GeoPoint> slots = {
        {19.0760, 72.8777}, {19.0800, 72.8820}, {19.0900, 72.8900},
        {19.0765, 72.8780}, {19.0770, 72.8790}, {19.0950, 72.8950},
    };
    auto ranked = rankSlots(fv, slots, area, 3);
    REQUIRE(ranked.size() == 3);
    // Ascending heuristic (lower cost = better slot).
    for (size_t i = 1; i < ranked.size(); ++i) {
        CHECK(ranked[i - 1].heuristic <= ranked[i].heuristic);
    }
    // Best candidate is the coincident slot (index 0).
    CHECK(ranked.front().slotIndex == 0);
}

TEST_CASE("rankSlots with fewer slots than topN returns all of them") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    GeoPoint area{19.0760, 72.8777};
    std::vector<GeoPoint> slots = {{19.0760, 72.8777}, {19.0800, 72.8820}};
    auto ranked = rankSlots(fv, slots, area, 5);
    CHECK(ranked.size() == 2);
}

TEST_CASE("rankSlots on an empty slot list returns nothing") {
    FeatureVector fv = buildFeatureVector(10, 3, {}, {}, {}, {}, 12, 3);
    GeoPoint area{19.0760, 72.8777};
    auto ranked = rankSlots(fv, {}, area, 5);
    CHECK(ranked.empty());
}
