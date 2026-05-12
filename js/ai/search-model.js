import { scoreFreeSlot } from "./feature-extractor.js";

export function recommendSlots(area, slots, features) {
  return slots
    .filter((slot) => slot.status === "unoccupied")
    .map((slot) => ({
      slot,
      score:
        scoreFreeSlot(slot, area) +
        (slot.slot_type === "standard" ? 0.08 : 0) +
        (features.route.roadMatched ? 0.04 : 0) -
        features.environment.score * 0.04
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.slot);
}
