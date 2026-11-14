import { describe, expect, it } from "vitest";
import { FACTOR_WEIGHTS, clampScore, computeRelevanceScore, parseSourceDate, recencyFactor, relevanceBand } from "@/engines/radar/relevance";

const NOW = new Date("2026-11-14T12:00:00Z");

describe("relevance scoring", () => {
  it("weights sum to 1", () => {
    const total = Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("returns null when no factors were assessed", () => {
    expect(computeRelevanceScore({})).toBeNull();
  });

  it("renormalises over the factors that are present", () => {
    // Only two factors: interest (.22) at 100 and recency (.14) at 0 -> 100*.22/.36
    const score = computeRelevanceScore({ interest_match: { score: 100, reason: "" }, recency: { score: 0, reason: "" } });
    expect(score).toBe(Math.round((100 * 0.22) / 0.36));
  });

  it("clamps out-of-range and non-finite factor scores", () => {
    expect(clampScore(140)).toBe(100);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(Number.NaN)).toBe(0);
    expect(computeRelevanceScore({ novelty: { score: 400, reason: "" } })).toBe(100);
  });

  it("bands scores with an explicit unknown state", () => {
    expect(relevanceBand(null).tone).toBe("unknown");
    expect(relevanceBand(80).tone).toBe("high");
    expect(relevanceBand(60).tone).toBe("medium");
    expect(relevanceBand(10).tone).toBe("low");
  });
});

describe("parseSourceDate", () => {
  it("parses relative dates against a fixed clock", () => {
    expect(parseSourceDate("3 days ago", NOW)?.toISOString()).toBe("2026-11-11T12:00:00.000Z");
    expect(parseSourceDate("1 week ago", NOW)?.toISOString()).toBe("2026-11-07T12:00:00.000Z");
    expect(parseSourceDate("yesterday", NOW)?.toISOString()).toBe("2026-11-13T12:00:00.000Z");
  });

  it("parses absolute dates", () => {
    expect(parseSourceDate("2026-03-04", NOW)?.toISOString().slice(0, 10)).toBe("2026-03-04");
    expect(parseSourceDate("March 3, 2026", NOW)?.getFullYear()).toBe(2026);
  });

  it("returns null for unknown or unparseable dates instead of guessing", () => {
    expect(parseSourceDate(null, NOW)).toBeNull();
    expect(parseSourceDate("", NOW)).toBeNull();
    expect(parseSourceDate("recently", NOW)).toBeNull();
    expect(parseSourceDate("123456", NOW)).toBeNull();
  });
});

describe("recencyFactor", () => {
  it("explains when dates are unknown", () => {
    const f = recencyFactor([null, null], NOW);
    expect(f.score).toBe(40);
    expect(f.reason).toMatch(/unknown/);
  });

  it("uses the newest known date", () => {
    const f = recencyFactor([new Date("2026-01-01T00:00:00Z"), new Date("2026-11-13T00:00:00Z")], NOW);
    expect(f.score).toBe(100);
    expect(f.reason).toContain("2026-11-13");
  });

  it("ignores dates well in the future", () => {
    const f = recencyFactor([new Date("2027-06-01T00:00:00Z"), new Date("2026-08-01T00:00:00Z")], NOW);
    expect(f.reason).toContain("2026-08-01");
    expect(f.score).toBe(30);
  });

  it("decays with age", () => {
    const at = (days: number) => recencyFactor([new Date(NOW.getTime() - days * 86_400_000)], NOW).score;
    expect(at(1)).toBeGreaterThan(at(5));
    expect(at(5)).toBeGreaterThan(at(20));
    expect(at(20)).toBeGreaterThan(at(60));
    expect(at(60)).toBeGreaterThan(at(200));
    expect(at(200)).toBeGreaterThan(at(800));
  });
});
