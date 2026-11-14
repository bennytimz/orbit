import { describe, expect, it } from "vitest";
import { buildCreateInput, preflight } from "@/engines/publisher/publish";

const NOW = new Date("2026-11-14T12:00:00Z");
const asset = { body: "A good post.", thread_parts: null, status: "approved" as const, guardian_status: "pass" as const };
const channel = { channel_id: "c1", name: "My LinkedIn", service: "linkedin", is_disconnected: false, is_locked: false };
const req = { channelIds: ["c1"], mode: "addToQueue" as const, dueAt: null, acknowledgeUnchecked: false };

describe("pre-publication checks", () => {
  it("passes a valid request", () => {
    expect(preflight(asset, [], [channel], req, NOW)).toEqual([]);
  });

  it("blocks on open blocking Guardian issues, but not resolved ones", () => {
    expect(preflight(asset, [{ severity: "blocking", review_status: "open", title: "Too long" }], [channel], req, NOW)).toHaveLength(1);
    expect(preflight(asset, [{ severity: "blocking", review_status: "resolved", title: "Too long" }], [channel], req, NOW)).toHaveLength(0);
  });

  it("requires acknowledgement for unchecked or stale content", () => {
    expect(preflight({ ...asset, guardian_status: "stale" }, [], [channel], req, NOW)).toHaveLength(1);
    expect(preflight({ ...asset, guardian_status: "unchecked" }, [], [channel], { ...req, acknowledgeUnchecked: true }, NOW)).toHaveLength(0);
  });

  it("rejects empty, rejected or archived content", () => {
    expect(preflight({ ...asset, body: " " }, [], [channel], req, NOW).length).toBeGreaterThan(0);
    expect(preflight({ ...asset, status: "rejected" }, [], [channel], req, NOW).length).toBeGreaterThan(0);
  });

  it("validates channels", () => {
    expect(preflight(asset, [], [channel], { ...req, channelIds: [] }, NOW)[0].message).toMatch(/at least one channel/);
    expect(preflight(asset, [], [channel], { ...req, channelIds: ["nope"] }, NOW)[0].channelId).toBe("nope");
    expect(preflight(asset, [], [{ ...channel, is_disconnected: true }], req, NOW)[0].message).toMatch(/disconnected/);
    expect(preflight(asset, [], [{ ...channel, is_locked: true }], req, NOW)[0].message).toMatch(/locked/);
  });

  it("blocks platforms that need media and text over the limit", () => {
    expect(preflight(asset, [], [{ ...channel, service: "instagram" }], req, NOW)[0].message).toMatch(/requires an image/);
    expect(preflight({ ...asset, body: "a".repeat(300) }, [], [{ ...channel, service: "twitter" }], req, NOW)[0].message).toMatch(/Too long/);
  });

  it("checks every thread post against X limits, since all of them are sent", () => {
    const problems = preflight({ ...asset, body: "x", thread_parts: ["short", "b".repeat(400)] }, [], [{ ...channel, service: "twitter" }], req, NOW);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(/Thread post 2 is too long for X/);
    expect(preflight({ ...asset, body: "x", thread_parts: ["short", "also short"] }, [], [{ ...channel, service: "twitter" }], req, NOW)).toEqual([]);
  });

  it("sends X threads as metadata.twitter.thread with every part, top-level text = first part", () => {
    const input = buildCreateInput(["one", "two", "three"], "c1", "draft", null, true);
    expect(input.text).toBe("one");
    expect(input.metadata).toEqual({ twitter: { thread: [{ text: "one" }, { text: "two" }, { text: "three" }] } });
    expect(buildCreateInput(["solo"], "c1", "draft", null, true).metadata).toBeUndefined();
  });

  it("requires a future time for custom scheduling", () => {
    const sched = { ...req, mode: "customScheduled" as const };
    expect(preflight(asset, [], [channel], { ...sched, dueAt: null }, NOW)).toHaveLength(1);
    expect(preflight(asset, [], [channel], { ...sched, dueAt: "2026-11-14T11:00:00Z" }, NOW)[0].message).toMatch(/future/);
    expect(preflight(asset, [], [channel], { ...sched, dueAt: "2026-11-15T09:00:00Z" }, NOW)).toEqual([]);
  });
});

describe("createPost input", () => {
  it("maps drafts to saveToDraft without a share mode of its own", () => {
    expect(buildCreateInput(["t"], "c1", "draft", null, true)).toEqual({ text: "t", channelId: "c1", schedulingType: "automatic", mode: "addToQueue", saveToDraft: true, aiAssisted: true, source: "orbit" });
  });

  it("includes dueAt in UTC only for custom scheduling", () => {
    expect(buildCreateInput(["t"], "c1", "customScheduled", "2026-11-20T09:30:00-05:00", false).dueAt).toBe("2026-11-20T14:30:00.000Z");
    expect(buildCreateInput(["t"], "c1", "addToQueue", "2026-11-20T09:30:00Z", false).dueAt).toBeUndefined();
    expect(buildCreateInput(["t"], "c1", "shareNow", null, false).mode).toBe("shareNow");
  });
});
