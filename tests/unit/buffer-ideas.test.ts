import { describe, expect, it, vi } from "vitest";
import { BufferApiError } from "@/lib/buffer/client";
import { CREATE_IDEA_MUTATION, buildDiscoveryIdeaContent, createIdea, interpretCreateIdeaPayload, recordedIdeaIds, saveIdeaOnce, shortSummary } from "@/lib/buffer/ideas";
import { BUFFER_SCOPES } from "@/lib/buffer/oauth";

describe("interpretCreateIdeaPayload", () => {
  it("accepts an Idea member with an ID", () => {
    expect(interpretCreateIdeaPayload({ __typename: "Idea", id: "idea_1", organizationId: "org", createdAt: 1794700000 })).toEqual({
      ok: true,
      idea: { id: "idea_1", organizationId: "org", createdAt: 1794700000 },
    });
  });

  it("accepts an IdeaResponse member wrapping an idea", () => {
    expect(interpretCreateIdeaPayload({ __typename: "IdeaResponse", idea: { id: "idea_2", organizationId: "org", createdAt: 1 } })).toEqual({
      ok: true,
      idea: { id: "idea_2", organizationId: "org", createdAt: 1 },
    });
  });

  it("does not treat an IdeaResponse without an idea as success", () => {
    expect(interpretCreateIdeaPayload({ __typename: "IdeaResponse", idea: null })).toEqual({ ok: false, errorType: "Unknown", message: "Buffer did not confirm the idea was created." });
  });

  it("does not treat an Idea without an ID as success", () => {
    expect(interpretCreateIdeaPayload({ __typename: "Idea", id: "" }).ok).toBe(false);
  });

  it.each(["InvalidInputError", "UnauthorizedError", "UnexpectedError", "LimitReachedError"] as const)("maps %s to a typed failure", (t) => {
    expect(interpretCreateIdeaPayload({ __typename: t, message: "nope" })).toEqual({ ok: false, errorType: t, message: "nope" });
  });

  it("supplies a message when an error member has none", () => {
    expect(interpretCreateIdeaPayload({ __typename: "LimitReachedError" })).toEqual({ ok: false, errorType: "LimitReachedError", message: "Buffer rejected the idea." });
  });

  it("treats null and unknown members as unconfirmed", () => {
    expect(interpretCreateIdeaPayload(null).ok).toBe(false);
    expect(interpretCreateIdeaPayload({ __typename: "SomethingNew", id: "x" })).toMatchObject({ ok: false, errorType: "Unknown" });
  });
});

describe("idea content", () => {
  it("keeps short summaries and appends the source link", () => {
    expect(buildDiscoveryIdeaContent({ title: " PostgreSQL 18 released ", summary: "Async I/O  lands.", sourceUrl: "https://www.postgresql.org/about/news/" })).toEqual({
      title: "PostgreSQL 18 released",
      text: "Async I/O lands.\n\nSource: https://www.postgresql.org/about/news/",
    });
  });

  it("omits the source line when there is no source", () => {
    expect(buildDiscoveryIdeaContent({ title: "T", summary: "S", sourceUrl: null }).text).toBe("S");
  });

  it("shortens long summaries at a word boundary", () => {
    const s = shortSummary("word ".repeat(200), 50);
    expect(s.length).toBeLessThanOrEqual(50);
    expect(s.endsWith("word…")).toBe(true);
  });
});

describe("createIdea", () => {
  const response = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("sends the createIdea mutation and parses the returned idea", async () => {
    const fetchImpl = response({ data: { createIdea: { __typename: "Idea", id: "idea_9", organizationId: "org", createdAt: 5 } } });
    const result = await createIdea("tok", { organizationId: "org", content: { title: "T", text: "S" } }, { fetchImpl });
    expect(result).toEqual({ ok: true, idea: { id: "idea_9", organizationId: "org", createdAt: 5 } });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.query).toBe(CREATE_IDEA_MUTATION);
    expect(body.variables).toEqual({ input: { organizationId: "org", content: { title: "T", text: "S" } } });
  });

  it("returns typed mutation errors delivered inside data", async () => {
    const fetchImpl = response({ data: { createIdea: { __typename: "InvalidInputError", message: "title too long" } } });
    expect(await createIdea("tok", { organizationId: "org", content: {} }, { fetchImpl })).toEqual({ ok: false, errorType: "InvalidInputError", message: "title too long" });
  });

  it("throws on top-level GraphQL errors (e.g. missing scope)", async () => {
    const fetchImpl = response({ data: null, errors: [{ message: "Missing scope", extensions: { code: "FORBIDDEN" } }] });
    await expect(createIdea("tok", { organizationId: "org", content: {} }, { fetchImpl })).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("marks network failures as ambiguous", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const err = await createIdea("tok", { organizationId: "org", content: {} }, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(BufferApiError);
    expect(err.ambiguous).toBe(true);
  });
});

describe("scopes", () => {
  it("requests ideas:write for createIdea", () => {
    expect(BUFFER_SCOPES).toContain("ideas:write");
  });
});

describe("duplicate protection", () => {
  it("refuses a repeat save without calling Buffer", async () => {
    const create = vi.fn();
    const record = vi.fn();
    const r = await saveIdeaOnce({ findRecordedIdeaId: async () => "idea_existing", create, record });
    expect(r).toEqual({ status: "already_saved", ideaId: "idea_existing" });
    expect(create).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("creates and records once when nothing is recorded", async () => {
    const create = vi.fn(async () => ({ ok: true as const, idea: { id: "idea_new", organizationId: "org", createdAt: 1 } }));
    const record = vi.fn(async () => {});
    expect(await saveIdeaOnce({ findRecordedIdeaId: async () => null, create, record })).toEqual({ status: "created", ideaId: "idea_new" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("idea_new");
  });

  it("records nothing when Buffer does not confirm", async () => {
    const record = vi.fn();
    const r = await saveIdeaOnce({
      findRecordedIdeaId: async () => null,
      create: async () => ({ ok: false, errorType: "LimitReachedError", message: "limit" }),
      record,
    });
    expect(r).toEqual({ status: "failed", errorType: "LimitReachedError", message: "limit" });
    expect(record).not.toHaveBeenCalled();
  });

  it("does not call Buffer when the saved-state lookup fails", async () => {
    const create = vi.fn();
    await expect(saveIdeaOnce({ findRecordedIdeaId: async () => { throw new Error("db down"); }, create, record: vi.fn() })).rejects.toThrow("db down");
    expect(create).not.toHaveBeenCalled();
  });

  it("maps recorded log rows to Idea IDs, keeping the first per discovery", () => {
    expect(
      recordedIdeaIds([
        { resource_id: "d1", metadata: { buffer_idea_id: "idea_a" } },
        { resource_id: "d1", metadata: { buffer_idea_id: "idea_b" } },
        { resource_id: "d2", metadata: {} },
        { resource_id: null, metadata: { buffer_idea_id: "idea_c" } },
        { resource_id: "d3", metadata: null },
      ]),
    ).toEqual({ d1: "idea_a" });
  });
});
