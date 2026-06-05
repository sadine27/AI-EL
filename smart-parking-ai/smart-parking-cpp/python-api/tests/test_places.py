"""
Tests for places.py — Places API collector and demand score computation.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from collectors.places import (
    fetch_nearby_places,
    compute_demand_score,
    _synthetic_demand,
    _type_hour_factor,
    _rating_factor,
    _review_volume_factor
)


class TestFetchNearbyPlaces:
    """Test the Places API collector with edge case handling."""

    @patch("httpx.AsyncClient")
    def test_successful_fetch(self, mock_client):
        """Successful fetch returns parsed places."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={
            "places": [
                {"name": "Test Cafe", "types": ["cafe"],
                 "rating": 4.0, "userRatingCount": 100,
                 "location": {"latitude": 19.0, "longitude": 72.0},
                 "currentOpeningHours": {"openNow": True}}
            ]
        })
        mock_instance = MagicMock()
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        result = None
        import asyncio
        result = asyncio.run(fetch_nearby_places({"lat": 19.0, "lng": 72.0}, "test-key"))
        assert result is not None
        assert "places" in result
        assert len(result["places"]) == 1
        assert result["places"][0]["name"] == "Test Cafe"

    @patch("httpx.AsyncClient")
    def test_empty_places_response(self, mock_client):
        """Empty places list should be handled."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json = MagicMock(return_value={"places": []})
        mock_instance = MagicMock()
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value = mock_instance

        import asyncio
        result = asyncio.run(fetch_nearby_places({"lat": 19.0, "lng": 72.0}, "test-key"))
        assert result["places"] == []

    def test_invalid_center(self):
        """Invalid center dict should raise ValueError."""
        import asyncio
        with pytest.raises(ValueError):
            asyncio.run(fetch_nearby_places({}, "test-key"))
        with pytest.raises(ValueError):
            asyncio.run(fetch_nearby_places(None, "test-key"))

    def test_radius_clamping(self):
        """Radius should be clamped to [1, 2000]."""
        import asyncio
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json = MagicMock(return_value={"places": []})
            mock_instance = MagicMock()
            mock_instance.post = AsyncMock(return_value=mock_response)
            mock_client.return_value.__aenter__.return_value = mock_instance

            # Radius 0 -> clamped to 1
            asyncio.run(fetch_nearby_places({"lat": 19.0, "lng": 72.0}, "test-key", radius_meters=0))
            call_json = mock_instance.post.call_args[1]["json"]
            assert call_json["locationRestriction"]["circle"]["radius"] >= 1

            # Radius 5000 -> clamped to 2000
            asyncio.run(fetch_nearby_places({"lat": 19.0, "lng": 72.0}, "test-key", radius_meters=5000))
            call_json = mock_instance.post.call_args[1]["json"]
            assert call_json["locationRestriction"]["circle"]["radius"] <= 2000


class TestComputeDemandScore:
    """Test demand score computation with edge cases."""

    def test_empty_places(self):
        """Empty places list should use synthetic demand."""
        score = compute_demand_score([], 12, 3)
        assert 0 <= score <= 1
        assert isinstance(score, float)

    def test_midnight_synthetic(self):
        """Synthetic demand at midnight should be low."""
        score = compute_demand_score([], 2, 3)
        assert score < 0.5

    def test_peak_hour_weekday_synthetic(self):
        """Synthetic demand at peak hour weekday should be higher."""
        score = compute_demand_score([], 18, 2)  # Tuesday 6pm
        score_non_peak = compute_demand_score([], 14, 2)  # Tuesday 2pm
        assert score > score_non_peak

    def test_weekend_synthetic(self):
        """Weekend daytime should have higher synthetic demand."""
        score = compute_demand_score([], 14, 6)  # Sunday 2pm
        score_night = compute_demand_score([], 23, 6)  # Sunday 11pm
        assert score > score_night

    def test_non_dict_places_skipped(self):
        """Non-dict items in places list should be skipped."""
        places = [None, "string", 123]
        score = compute_demand_score(places, 12, 3)
        # Should fall through to empty list handling
        assert 0 <= score <= 1


class TestSyntheticDemand:
    """Test _synthetic_demand edge cases."""

    def test_out_of_range_hour(self):
        """Hour outside 0-23 should be clamped."""
        demand = _synthetic_demand(-1, 3)
        assert 0 <= demand <= 1
        demand2 = _synthetic_demand(24, 3)
        assert 0 <= demand2 <= 1

    def test_out_of_range_day(self):
        """Day outside 0-6 should be clamped."""
        demand = _synthetic_demand(12, -1)
        assert 0 <= demand <= 1


class TestTypeHourFactor:
    """Test _type_hour_factor edge cases."""

    def test_unknown_type(self):
        """Unknown place type should use default factor."""
        factor = _type_hour_factor("unknown_type", 12, 3)
        assert 0 <= factor <= 1.5

    def test_empty_type(self):
        """Empty string type should use default."""
        factor = _type_hour_factor("", 12, 3)
        assert 0 <= factor <= 1.5

    def test_none_type(self):
        """None type should use default."""
        factor = _type_hour_factor(None, 12, 3)
        assert 0 <= factor <= 1.5

    def test_school_weeknight(self):
        """School should have very low factor at night."""
        factor = _type_hour_factor("school", 22, 2)
        assert factor <= 0.2


class TestRatingFactor:
    """Test _rating_factor edge cases."""

    def test_zero_rating(self):
        """Zero rating should return 1.0."""
        assert _rating_factor(0) == 1.0

    def test_negative_rating(self):
        """Negative rating should return 1.0."""
        assert _rating_factor(-5) == 1.0

    def test_nan_rating(self):
        """NaN rating should return 1.0."""
        import math
        assert _rating_factor(float('nan')) == 1.0

    def test_inf_rating(self):
        """Infinity rating should return 1.0."""
        import math
        assert _rating_factor(float('inf')) == 1.0

    def test_normal_range(self):
        """Normal ratings should produce scaled factors."""
        assert 0.78 <= _rating_factor(3.0) <= 1.22
        assert _rating_factor(5.0) >= _rating_factor(3.0)


class TestReviewVolumeFactor:
    """Test _review_volume_factor edge cases."""

    def test_zero_reviews(self):
        """Zero reviews should return 0.55."""
        assert _review_volume_factor(0) == 0.55

    def test_negative_reviews(self):
        """Negative reviews should return 0.55."""
        assert _review_volume_factor(-10) == 0.55

    def test_non_integer(self):
        """Non-integer input should be handled."""
        assert _review_volume_factor("string") == 0.55
