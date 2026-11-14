import { describe, expect, it } from "vitest";
import { extractStatistics, findUnsupportedStatistics, overallStatus, runRuleChecks, similarity, type RuleInput } from "@/engines/guardian/rules";

const base: RuleInput = {
  body: "A clear, specific post about database migrations.",
  threadParts: null,
  platform: "linkedin",
  wordsToAvoid: [],
  supportingTexts: [],
  otherBodies: [],
  hasResearch: false,
  linkedSourceCount: 0,
};
const types = (input: Partial<RuleInput>) => runRuleChecks({ ...base, ...input }).map((i) => `${i.issue_type}:${i.severity}`);

describe("Guardian rule checks", () => {
  it("passes clean content", () => {
    expect(runRuleChecks(base)).toEqual([]);
  });

  it("blocks empty content and stops", () => {
    expect(types({ body: "   " })).toEqual(["completeness:blocking"]);
  });

  it("blocks content over the platform limit", () => {
    expect(types({ platform: "x", body: "a".repeat(281) })).toContain("platform_constraint:blocking");
    expect(types({ platform: "x", body: "a".repeat(280) })).not.toContain("platform_constraint:blocking");
  });

  it("checks each thread part separately, without a first-post-only note", () => {
    const issues = runRuleChecks({ ...base, platform: "x", body: "x", threadParts: ["short", "b".repeat(300)] });
    expect(issues.find((i) => i.severity === "blocking")?.title).toMatch(/Thread post 2/);
    expect(issues.some((i) => /first post/i.test(i.title))).toBe(false);
  });

  it("flags platforms that require media", () => {
    expect(types({ platform: "instagram" })).toContain("missing_media:warning");
  });

  it("blocks unfilled placeholders", () => {
    expect(types({ body: "Join us at [insert link] tomorrow." })).toContain("completeness:blocking");
    expect(types({ body: "Hello {{name}}" })).toContain("completeness:blocking");
  });

  it("flags words on the avoid list, case-insensitively", () => {
    const issues = runRuleChecks({ ...base, body: "This is a Game-Changer for teams.", wordsToAvoid: ["game-changer"] });
    expect(issues.map((i) => i.issue_type)).toContain("brand_consistency");
  });

  it("flags generic AI phrasing", () => {
    expect(types({ body: "In today's fast-paced world, let's dive in." })).toContain("brand_consistency:warning");
  });

  it("flags statistics and years missing from sources", () => {
    const issues = runRuleChecks({ ...base, body: "Adoption grew 40% in 2025.", supportingTexts: ["Nothing numeric here."] });
    expect(issues.map((i) => i.issue_type)).toEqual(expect.arrayContaining(["unsupported_statistic", "date_check"]));
  });

  it("accepts statistics and years that appear in sources", () => {
    const issues = runRuleChecks({ ...base, body: "Adoption grew 40% in 2025.", supportingTexts: ["In 2025 adoption grew by 40 percent."] });
    expect(issues.map((i) => i.issue_type)).not.toContain("unsupported_statistic");
    expect(issues.map((i) => i.issue_type)).not.toContain("date_check");
  });

  it("detects near-duplicate drafts", () => {
    const text = "Postgres 18 makes logical replication much easier to operate for small teams running their own clusters.";
    expect(types({ body: text, otherBodies: [{ id: "1", title: "Old", body: text }] })).toContain("duplicate_content:warning");
  });

  it("flags research content with figures but no linked sources", () => {
    expect(types({ body: "Costs fell by $2 million.", hasResearch: true, linkedSourceCount: 0, supportingTexts: ["$2 million"] })).toContain("source_traceability:warning");
  });
});

describe("statistics helpers", () => {
  it("extracts percentages, currency and multipliers", () => {
    expect(extractStatistics("Up 40%, $3.5 billion raised, 10x faster, 2,000 users")).toEqual(expect.arrayContaining(["40%", "$3.5 billion", "10x"]));
  });

  it("normalises separators and 'percent'", () => {
    expect(findUnsupportedStatistics("It reached $1,200 million and 12%", ["$1200 million", "12 percent"])).toEqual([]);
  });

  it("measures similarity", () => {
    expect(similarity("one two three four", "one two three four")).toBe(1);
    expect(similarity("one two three four", "five six seven eight")).toBe(0);
    expect(similarity("hi", "hi")).toBe(0);
  });
});

describe("overallStatus", () => {
  it("considers only open issues", () => {
    expect(overallStatus([])).toBe("pass");
    expect(overallStatus([{ severity: "warning" }])).toBe("warnings");
    expect(overallStatus([{ severity: "blocking" }, { severity: "warning" }])).toBe("blocking");
    expect(overallStatus([{ severity: "blocking", review_status: "resolved" }, { severity: "info" }])).toBe("pass");
  });
});
