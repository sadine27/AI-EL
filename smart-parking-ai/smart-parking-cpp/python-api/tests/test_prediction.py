"""
Tests for prediction.py — ensemble_predict function.
"""

import pytest
from models.prediction import ensemble_predict


class TestEnsemblePredict:
    """Test the ensemble_predict function with various edge cases."""

    def test_cpp_result_preferred(self):
        """C++ result should be preferred when available."""
        cpp = {"predictedAvailable": 7, "predictedOccupancyPct": 30}
        fallback = {"predictedAvailable": 6, "predictedOccupancyPct": 40}
        result = ensemble_predict(cpp, fallback)
        assert result["engine"] == "cpp"
        assert result["predictedAvailable"] == 7

    def test_fallback_when_cpp_none(self):
        """Fallback should be used when C++ result is None."""
        fallback = {"predictedAvailable": 6, "predictedOccupancyPct": 40}
        result = ensemble_predict(None, fallback)
        assert result["engine"] == "python-fallback"
        assert result["predictedAvailable"] == 6

    def test_cpp_missing_keys(self):
        """C++ result missing predictedAvailable should fallback."""
        cpp = {"someOtherField": "value"}
        fallback = {"predictedAvailable": 6}
        result = ensemble_predict(cpp, fallback)
        assert result["engine"] == "python-fallback"

    def test_both_none(self):
        """Both None should return error dict with safe defaults."""
        result = ensemble_predict(None, None)
        assert result["engine"] == "none"
        assert "error" in result
        assert result["predictedAvailable"] == 0

    def test_cpp_non_dict(self):
        """Non-dict C++ result should fallback."""
        result = ensemble_predict("string", {"predictedAvailable": 5})
        assert result["engine"] == "python-fallback"

    def test_fallback_non_dict(self):
        """Non-dict fallback when C++ is also unavailable."""
        result = ensemble_predict(None, "string")
        assert result["engine"] == "none"

    def test_cpp_result_preserves_extra_fields(self):
        """Extra fields in C++ result should be preserved."""
        cpp = {"predictedAvailable": 7, "extraField": "test_value"}
        result = ensemble_predict(cpp, None)
        assert result["extraField"] == "test_value"
