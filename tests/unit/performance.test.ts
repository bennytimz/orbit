import { describe, expect, it } from "vitest";
import { engagementRate, isStale, METRICS_REFRESH_MS, performanceInsights, type ScoredPost } from "@/engines/evolution/performance";

const m = (pairs: Record<string, number>) => Object.entries(pairs).map(([type, value]) => ({ type, value, unit: type === "engagementRate" ? "percentage" : "count" }));
const post = (rate: number | null, over: Partial<ScoredPost["features"]> = {}): ScoredPost => ({
  engagementRate: rate,
  features: { platform: "linkedin", isThread: false, hasMedia: false, length: 300, ...over },
});

describe("engagement rate", () => {
  it("prefers Buffer's reported rate", () => {
    expect(engagementRate(m({ engagementRate: 4.21, impressions: 95, reactions: 2 }))).toBe(4.21);
  });
  it("computes interactions / impressions when no rate is reported", () => {
    expect(engagementRate(m({ impressions: 200, reactions: 6, comments: 2, reposts: 2 }))).toBe(5);
  });
  it("returns null instead of guessing", () => {
    expect(engagementRate(m({ reactions: 4 }))).toBeNull();
    expect(engagementRate(null)).toBeNull();
    expect(engagementRate(m({ impressions: 0, reactions: 1 }))).toBeNull();
  });
});

describe("performance insights", () => {
  it("says nothing with too few posts on either side", () => {
    const posts = [post(8, { hasMedia: true }), post(9, { hasMedia: true }), post(2), post(2), post(2)];
    expect(performanceInsights(posts)).toEqual([]);
  });
  it("reports a clear media difference with the evidence in the rationale", () => {
    const posts = [post(6, { hasMedia: true }), post(8, { hasMedia: true }), post(7, { hasMedia: true }), post(3), post(2), post(4)];
    const [insight] = performanceInsights(posts);
    expect(insight.preference_key).toBe("performance_media");
    expect(insight.ratio).toBeCloseTo(7 / 3);
    expect(insight.rationale).toMatch(/2\.3× higher engagement rate/);
    expect(insight.rationale).toMatch(/3 vs 3 posts/);
    expect(insight.confidence).toBe("low");
  });
  it("ignores differences below 1.5× and posts without a rate", () => {
    const posts = [post(5, { hasMedia: true }), post(5, { hasMedia: true }), post(5, { hasMedia: true }), post(4), post(4), post(4), post(null, { hasMedia: true })];
    expect(performanceInsights(posts)).toEqual([]);
  });
  it("compares X threads only among X posts", () => {
    const x = (rate: number, isThread: boolean) => post(rate, { platform: "x", isThread });
    const posts = [x(2, true), x(2, true), x(2, true), x(6, false), x(6, false), x(6, false), post(50, { isThread: true })];
    const insight = performanceInsights(posts).find((i) => i.preference_key === "performance_threads");
    expect(insight?.preference_value).toMatch(/single focused post/);
  });
});

describe("refresh cadence", () => {
  it("refreshes when never fetched or older than 12 hours", () => {
    const now = Date.parse("2026-11-19T12:00:00Z");
    expect(isStale(null, now)).toBe(true);
    expect(isStale(new Date(now - METRICS_REFRESH_MS - 1).toISOString(), now)).toBe(true);
    expect(isStale(new Date(now - 60_000).toISOString(), now)).toBe(false);
  });
});
