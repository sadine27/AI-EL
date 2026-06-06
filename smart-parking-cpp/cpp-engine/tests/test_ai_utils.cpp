// Edge case tests for utility functions
// Compile with: g++ -std=c++17 -I../include -I. test_ai_utils.cpp ../src/ai_utils.cpp -o test_ai_utils

#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include "doctest.h"
#include "ai_utils.h"
#include <limits>

TEST_CASE("clamp function edge cases") {
    // Normal range
    CHECK(parking::clamp(0.5, 0.0, 1.0) == doctest::Approx(0.5));
    CHECK(parking::clamp(0.0, 0.0, 1.0) == doctest::Approx(0.0));
    CHECK(parking::clamp(1.0, 0.0, 1.0) == doctest::Approx(1.0));

    // Below min
    CHECK(parking::clamp(-0.5, 0.0, 1.0) == doctest::Approx(0.0));
    CHECK(parking::clamp(-100.0, 0.0, 1.0) == doctest::Approx(0.0));

    // Above max
    CHECK(parking::clamp(1.5, 0.0, 1.0) == doctest::Approx(1.0));
    CHECK(parking::clamp(100.0, 0.0, 1.0) == doctest::Approx(1.0));

    // Identity range
    CHECK(parking::clamp(0.5, 0.5, 0.5) == doctest::Approx(0.5));
}

TEST_CASE("clamp neutralizes non-finite input") {
    const double inf = std::numeric_limits<double>::infinity();
    const double nan = std::numeric_limits<double>::quiet_NaN();
    // NaN/inf must collapse to the lower bound, never propagate.
    CHECK(parking::clamp(nan, 0.0, 1.0) == doctest::Approx(0.0));
    CHECK(parking::clamp(inf, 0.0, 1.0) == doctest::Approx(0.0));
    CHECK(parking::clamp(-inf, 0.0, 1.0) == doctest::Approx(0.0));
    CHECK(parking::clamp(nan, 0.5, 2.0) == doctest::Approx(0.5));
}

TEST_CASE("safe_divide edge cases") {
    // Normal division
    CHECK(parking::safe_divide(10.0, 2.0) == doctest::Approx(5.0));

    // Division by zero returns 0
    CHECK(parking::safe_divide(10.0, 0.0) == doctest::Approx(0.0));
    CHECK(parking::safe_divide(0.0, 0.0) == doctest::Approx(0.0));

    // Negative numerator
    CHECK(parking::safe_divide(-10.0, 2.0) == doctest::Approx(-5.0));

    // Both zero
    CHECK(parking::safe_divide(0.0, 5.0) == doctest::Approx(0.0));

    // Non-finite operands collapse to 0 (documented "keep finite" contract)
    const double inf = std::numeric_limits<double>::infinity();
    const double nan = std::numeric_limits<double>::quiet_NaN();
    CHECK(parking::safe_divide(nan, 2.0) == doctest::Approx(0.0));
    CHECK(parking::safe_divide(10.0, nan) == doctest::Approx(0.0));
    CHECK(parking::safe_divide(inf, 2.0) == doctest::Approx(0.0));
}

TEST_CASE("safe_log edge cases") {
    // Normal log
    CHECK(parking::safe_log(1.0) == doctest::Approx(0.0));
    CHECK(parking::safe_log(2.71828) == doctest::Approx(1.0).epsilon(0.01));

    // log(0) returns 0
    CHECK(parking::safe_log(0.0) == doctest::Approx(0.0));

    // log(negative) returns 0
    CHECK(parking::safe_log(-5.0) == doctest::Approx(0.0));

    // log(very small positive) should work
    CHECK(parking::safe_log(0.5) < 0);

    // Non-finite input returns 0 instead of propagating inf/NaN
    const double inf = std::numeric_limits<double>::infinity();
    const double nan = std::numeric_limits<double>::quiet_NaN();
    CHECK(parking::safe_log(inf) == doctest::Approx(0.0));
    CHECK(parking::safe_log(nan) == doctest::Approx(0.0));
}
