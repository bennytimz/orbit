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

import { vi } from "vitest";
import { AIServiceError } from "@/lib/ai/errors";
import { discoverFromFeedItems } from "@/engines/radar/discover";

vi.mock("@/engines/brain/context", () => ({ loadUserContext: async () => ({}), describeIdentity: () => "" }));
vi.mock("@/lib/ai/client", () => ({
  webResearch: vi.fn(),
  generateStructured: vi.fn(async () => {
    throw new AIServiceError("provider_unavailable", "The AI provider is temporarily unavailable. Your saved work is safe.", '503 {"error":{"code":503}}');
  }),
}));

describe("discoverFromFeedItems", () => {
  it("reports only the user-safe message when every batch fails", async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ source: { url: `https://example.com/${i}`, title: `Item ${i}` }, passages: ["x".repeat(2000)] }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await discoverFromFeedItems({} as never, "user", items as never, "focus").catch((e) => e);
    expect(err).toBeInstanceOf(AIServiceError);
    expect(err.userMessage).toBe("The AI provider is temporarily unavailable. Your saved work is safe.");
    expect(err.userMessage).not.toContain("503");
  });
});
