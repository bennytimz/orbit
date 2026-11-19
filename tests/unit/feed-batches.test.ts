import { describe, expect, it } from "vitest";
import { FEED_BATCH_SIZE, FEED_MAX_ITEMS, feedBatches } from "@/engines/radar/discover";

describe("feedBatches", () => {
  it("caps items and splits them into small sequential batches", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const batches = feedBatches(items);
    expect(batches.flat()).toEqual(items.slice(0, FEED_MAX_ITEMS));
    expect(batches.every((b) => b.length <= FEED_BATCH_SIZE)).toBe(true);
  });

  it("keeps a short final batch and handles empty input", () => {
    expect(feedBatches([1, 2, 3, 4], 3, 10)).toEqual([[1, 2, 3], [4]]);
    expect(feedBatches([])).toEqual([]);
  });
});
