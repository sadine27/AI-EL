"""
Tests for features.py — FeatureVector dataclass and compute_live_occupancy.
"""

import pytest
import math
from models.features import FeatureVector, compute_live_occupancy


class TestFeatureVector:
    """Test the FeatureVector dataclass with edge case validation."""

    def test_default_values(self):
        """Default FeatureVector should have reasonable defaults."""
        fv = FeatureVector()
        assert fv.total_slots == 10
        assert fv.unavailable == 3
        assert fv.hour == 12
        assert fv.day_of_week == 3
        assert 0 <= fv.live_occupancy_ratio <= 1
        assert 0 <= fv.demand_score <= 1

    def test_negative_slots_clamped(self):
        """Negative total_slots should be clamped to 0."""
        fv = FeatureVector(total_slots=-5)
        assert fv.total_slots >= 0

    def test_unavailable_exceeds_total(self):
        """unavailable > total_slots should be clamped to total_slots."""
        fv = FeatureVector(total_slots=10, unavailable=20)
        assert fv.unavailable <= fv.total_slots

    def test_nan_values_clamped(self):
        """NaN in any float field should be clamped to 0."""
        fv = FeatureVector(
            live_occupancy_ratio=float('nan'),
            demand_score=float('nan')
        )
        assert not math.isnan(fv.live_occupancy_ratio)
        assert fv.live_occupancy_ratio >= 0
        assert fv.demand_score >= 0

    def test_infinity_values_clamped(self):
        """Infinity should be clamped."""
        fv = FeatureVector(
            live_occupancy_ratio=float('inf'),
            demand_score=float('-inf')
        )
        assert 0 <= fv.live_occupancy_ratio <= 1
        assert fv.demand_score >= 0

    def test_hour_clamped_range(self):
        """Hour values outside 0-23 should be clamped."""
        fv = FeatureVector(hour=25)
        assert 0 <= fv.hour <= 23
        fv2 = FeatureVector(hour=-1)
        assert 0 <= fv2.hour <= 23

    def test_day_of_week_clamped(self):
        """Day of week outside 0-6 should be clamped."""
        fv = FeatureVector(day_of_week=7)
        assert 0 <= fv.day_of_week <= 6
        fv2 = FeatureVector(day_of_week=-1)
        assert 0 <= fv2.day_of_week <= 6

    def test_weekend_detection(self):
        """Weekend flag should be set for Saturday (5) and Sunday (6)."""
        fv_sat = FeatureVector(day_of_week=5)
        assert fv_sat.weekend == 1
        fv_sun = FeatureVector(day_of_week=6)
        assert fv_sun.weekend == 1
        fv_mon = FeatureVector(day_of_week=0)
        assert fv_mon.weekend == 0  # Monday is not a weekend (Sat=5, Sun=6)
        fv_tue = FeatureVector(day_of_week=2)
        assert fv_tue.weekend == 0

    def test_peak_hour_detection(self):
        """Peak hour should be set for commuting/shopping peak hours."""
        peak_hours = [8, 9, 12, 13, 17, 18, 19, 20]
        non_peak_hours = [3, 6, 10, 14, 22, 23]
        for h in peak_hours:
            fv = FeatureVector(hour=h)
            assert fv.peak_hour == 1, f"Hour {h} should be peak"
        for h in non_peak_hours:
            fv = FeatureVector(hour=h)
            assert fv.peak_hour == 0, f"Hour {h} should NOT be peak"


class TestComputeLiveOccupancy:
    """Test compute_live_occupancy edge cases."""

    def test_normal_case(self):
        """Normal occupancy calculation."""
        assert compute_live_occupancy(3, 10) == 0.3
        assert compute_live_occupancy(0, 10) == 0.0
        assert compute_live_occupancy(10, 10) == 1.0

    def test_zero_total_slots(self):
        """Zero total slots should return 0.0 to avoid division by zero."""
        assert compute_live_occupancy(5, 0) == 0.0
        assert compute_live_occupancy(0, 0) == 0.0

    def test_negative_total_slots(self):
        """Negative total slots should return 0.0."""
        assert compute_live_occupancy(3, -5) == 0.0

    def test_unavailable_exceeds_total(self):
        """If unavailable > total, should cap at 1.0."""
        result = compute_live_occupancy(20, 10)
        assert 0 <= result <= 1.0

    def test_non_integer_inputs(self):
        """String or None inputs should be handled gracefully."""
        assert compute_live_occupancy("3", "10") == 0.3
        assert compute_live_occupancy(None, 10) == 0.0
