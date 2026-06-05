"""Feature extraction helpers for the Python fallback predictor.

Edge cases handled:
- zero/negative total slots -> safe defaults
- NaN/Infinity in any numeric field -> clamped to 0
"""

from dataclasses import dataclass, field
import math


@dataclass
class FeatureVector:
    total_slots: int = 10
    unavailable: int = 3
    live_occupancy_ratio: float = 0.0
    demand_score: float = 0.28
    environment_score: float = 0.0
    route_score: float = 0.0
    historical_pressure: float = 0.0
    hour: int = 12
    day_of_week: int = 3
    weekend: int = 0
    peak_hour: int = 0

    def __post_init__(self):
        """Post-initialization validation to clamp edge values."""
        self.total_slots = max(0, self.total_slots)
        self.unavailable = max(0, min(self.unavailable, self.total_slots))
        self.live_occupancy_ratio = self._safe_clamp(self.live_occupancy_ratio, 0, 1)
        self.demand_score = self._safe_clamp(self.demand_score, 0, 1)
        self.environment_score = self._safe_clamp(self.environment_score, 0, 1)
        self.route_score = self._safe_clamp(self.route_score, 0, 1)
        self.historical_pressure = self._safe_clamp(self.historical_pressure, 0, 1)
        self.hour = max(0, min(23, self.hour))
        self.day_of_week = max(0, min(6, self.day_of_week))
        # Saturday=5, Sunday=6 are weekends (Python: Monday=0)
        self.weekend = 1 if self.day_of_week in (5, 6) else 0
        self.peak_hour = 1 if self.hour in (8, 9, 12, 13, 17, 18, 19, 20) else 0

    @staticmethod
    def _safe_clamp(val, lo, hi):
        """Clamp value, handling NaN/Infinity."""
        try:
            v = float(val)
            if math.isnan(v) or math.isinf(v):
                return lo
            return max(lo, min(hi, v))
        except (TypeError, ValueError):
            return lo


def compute_live_occupancy(unavailable, total_slots) -> float:
    """Compute occupancy ratio, safely handling non-integer inputs and zero division."""
    try:
        unavailable = int(unavailable) if unavailable is not None else 0
        total_slots = int(total_slots) if total_slots is not None else 0
    except (TypeError, ValueError):
        return 0.0
    if total_slots <= 0:
        return 0.0
    unavailable = max(0, unavailable)
    total_slots = max(1, total_slots)
    return min(1.0, unavailable / total_slots)
