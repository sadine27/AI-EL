"""
Informed search — A* (Unit 2).

Given the current situation, search over the next few 30-minute arrival slots to
find the time with the lowest expected "cost" of parking. Cost combines the
predicted occupancy at that slot with a waiting penalty (you usually want to park
soon). A* uses g = accumulated wait + occupancy cost so far, and an admissible
heuristic h = the lowest achievable remaining occupancy cost.

This turns the prediction into an actionable recommendation: "best to arrive at…".
"""

from __future__ import annotations

import heapq
from typing import Callable


def _time_pressure_for(hour: int, day: int) -> float:
    """Recompute a time-of-day pressure for an arbitrary future hour/day."""
    hour %= 24
    weekend = day % 7 in (0, 6)
    pressure = 0.30
    if hour in (8, 9, 17, 18, 19) and not weekend:
        pressure += 0.22
    if hour in (12, 13, 18, 19, 20):
        pressure += 0.24
    if weekend and 11 <= hour <= 21:
        pressure += 0.22
    if hour >= 22 or hour <= 6:
        pressure -= 0.22
    return max(0.05, min(0.95, pressure))


def best_arrival_search(
    base_features: dict,
    occupancy_fn: Callable[[dict], float],
    start_hour: int,
    start_day: int,
    slots: int = 6,
    slot_minutes: int = 30,
) -> dict:
    """A* over future arrival slots. Returns the lowest-cost arrival recommendation.

    occupancy_fn(features) -> occupancy probability [0,1] for a candidate slot.
    """
    slots = max(1, min(12, slots))

    # Pre-compute occupancy for each slot by replaying time pressure forward.
    slot_cost: list[float] = []
    slot_meta: list[dict] = []
    for i in range(slots):
        minutes_ahead = i * slot_minutes
        hour = (start_hour + (minutes_ahead // 60)) % 24
        feat = dict(base_features)
        feat["timePressure"] = _time_pressure_for(hour, start_day)
        occ = max(0.0, min(1.0, occupancy_fn(feat)))
        wait_penalty = (minutes_ahead / 60.0) * 0.12  # prefer arriving sooner
        slot_cost.append(occ + wait_penalty)
        slot_meta.append({"index": i, "minutesAhead": minutes_ahead, "hour": hour, "occupancy": occ})

    # Admissible heuristic: minimum remaining slot cost from index i onward.
    min_suffix = [0.0] * (slots + 1)
    for i in range(slots - 1, -1, -1):
        min_suffix[i] = min(slot_cost[i], min_suffix[i + 1] if i + 1 < slots else slot_cost[i])

    # A* / uniform-cost over a simple line graph of slots; goal = pick a slot.
    # State = slot index; g = cost to "commit" to that slot. We want the min-cost slot,
    # the heuristic guides expansion toward cheaper futures.
    frontier: list[tuple[float, int]] = []
    heapq.heappush(frontier, (slot_cost[0] + min_suffix[0], 0))
    visited: set[int] = set()
    best_index = 0
    best_g = slot_cost[0]

    while frontier:
        _, idx = heapq.heappop(frontier)
        if idx in visited:
            continue
        visited.add(idx)

        if slot_cost[idx] < best_g:
            best_g = slot_cost[idx]
            best_index = idx

        # Expand neighbour (next slot in time).
        nxt = idx + 1
        if nxt < slots and nxt not in visited:
            f = slot_cost[nxt] + min_suffix[nxt]
            heapq.heappush(frontier, (f, nxt))

    chosen = slot_meta[best_index]
    return {
        "bestSlotMinutesAhead": chosen["minutesAhead"],
        "bestHour": chosen["hour"],
        "bestOccupancy": round(chosen["occupancy"], 4),
        "nowOccupancy": round(slot_meta[0]["occupancy"], 4),
        "slots": slot_meta,
        "improvesIfWait": best_index > 0,
    }
