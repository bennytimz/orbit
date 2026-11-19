import { describe, expect, it } from "vitest";
import { interpretContentItemPayload } from "@/lib/buffer/content-items";
import { groupProblems, outcomesFromContentItem } from "@/engines/publisher/group";

describe("createContentItem payload", () => {
  it("reads the item id and one post per channel on success", () => {
    const r = interpretContentItemPayload({
      __typename: "CreateContentItemSuccess",
      content: { id: "ci1", body: { __typename: "PostContent", posts: [{ id: "p1", channelId: "li", status: "draft", dueAt: null }, { id: "p2", channelId: "x", status: "draft", dueAt: null }] } },
    });
    expect(r).toEqual({ ok: true, contentItemId: "ci1", posts: [{ id: "p1", channelId: "li", status: "draft", dueAt: null }, { id: "p2", channelId: "x", status: "draft", dueAt: null }] });
  });
  it("collects per-channel and general errors on failure", () => {
    const r = interpretContentItemPayload({
      __typename: "CreateContentItemFailure",
      message: "Could not create",
      errors: [{ __typename: "CreateContentItemVariantInvalidInputError", channelId: "x", message: "Too long" }, { __typename: "LimitReachedError", message: "Plan limit" }],
    });
    expect(r).toEqual({ ok: false, message: "Could not create", channelErrors: { x: "Too long" }, generalErrors: ["Plan limit"] });
  });
});

describe("grouped send outcomes", () => {
  it("maps posts to channels and never treats a failure as safe to retry", () => {
    const success = outcomesFromContentItem({ ok: true, contentItemId: "ci", posts: [{ id: "p1", channelId: "li", status: "draft", dueAt: null }] }, ["li", "x"]);
    expect(success.li).toMatchObject({ status: "succeeded", postId: "p1" });
    expect(success.x.status).toBe("unknown");
    const failure = outcomesFromContentItem({ ok: false, message: "Nope", channelErrors: { x: "Too long" }, generalErrors: [] }, ["li", "x"]);
    expect(failure.li.status).toBe("unknown");
    expect(failure.x.message).toMatch(/^Too long/);
  });
  it("requires 2+ variants of the same content on distinct channels", () => {
    const assets = [
      { id: "a", generation_group: "g" },
      { id: "b", generation_group: "g" },
      { id: "c", generation_group: "other" },
    ];
    expect(groupProblems([{ assetId: "a", channelId: "li" }, { assetId: "b", channelId: "x" }], assets)).toEqual([]);
    expect(groupProblems([{ assetId: "a", channelId: "li" }], assets)[0]).toMatch(/at least two/);
    expect(groupProblems([{ assetId: "a", channelId: "li" }, { assetId: "b", channelId: "li" }], assets)[0]).toMatch(/one post per channel/);
    expect(groupProblems([{ assetId: "a", channelId: "li" }, { assetId: "c", channelId: "x" }], assets)[0]).toMatch(/generated together/);
  });
});
