import { describe, expect, it } from "vitest";
import { buildImageAssets, instagramMetadata, mediaProblems, readImageDimensions, sniffImageMime, type MediaInfo } from "@/engines/studio/media";
import { buildCreateInput, preflight } from "@/engines/publisher/publish";
import { runRuleChecks, type RuleInput } from "@/engines/guardian/rules";

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}
function gif(width: number, height: number): Uint8Array {
  const b = new Uint8Array(13);
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const v = new DataView(b.buffer);
  v.setUint16(6, width, true);
  v.setUint16(8, height, true);
  return b;
}
function jpeg(width: number, height: number): Uint8Array {
  // SOI, APP0 (length 16), SOF0 (length 17)
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, ...new Array(9).fill(0)];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9]);
}
const img = (over: Partial<MediaInfo> = {}): MediaInfo => ({ id: "m1", mime_type: "image/jpeg", size_bytes: 200_000, width: 1080, height: 1080, alt_text: "A chart", ...over });

describe("image sniffing", () => {
  it("detects types from bytes, not names", () => {
    expect(sniffImageMime(png(1, 1))).toBe("image/png");
    expect(sniffImageMime(gif(1, 1))).toBe("image/gif");
    expect(sniffImageMime(jpeg(1, 1))).toBe("image/jpeg");
    expect(sniffImageMime(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(sniffImageMime(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull(); // WebP/RIFF is not a Buffer image format
  });
  it("reads dimensions", () => {
    expect(readImageDimensions(png(1200, 627), "image/png")).toEqual({ width: 1200, height: 627 });
    expect(readImageDimensions(gif(480, 270), "image/gif")).toEqual({ width: 480, height: 270 });
    expect(readImageDimensions(jpeg(1080, 1350), "image/jpeg")).toEqual({ width: 1080, height: 1350 });
    expect(readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg")).toBeNull();
  });
});

describe("platform media rules", () => {
  it("Instagram needs at least one JPEG/PNG image in a supported aspect ratio", () => {
    expect(mediaProblems([], "instagram", "Instagram")[0]).toMatch(/at least 1 image/);
    expect(mediaProblems([img()], "instagram", "Instagram")).toEqual([]);
    expect(mediaProblems([img({ mime_type: "image/gif" })], "instagram", "Instagram")[0]).toMatch(/GIF; Instagram accepts JPEG, PNG/);
    expect(mediaProblems([img({ width: 1080, height: 1920 })], "instagram", "Instagram")[0]).toMatch(/aspect ratio/);
  });
  it("text-only stays valid for platforms where media is optional", () => {
    expect(mediaProblems([], "linkedin", "LinkedIn")).toEqual([]);
    expect(mediaProblems([], "newsletter", "Newsletter")).toEqual([]);
  });
  it("enforces counts and GIF exclusivity", () => {
    const five = [1, 2, 3, 4, 5].map((n) => img({ id: `m${n}` }));
    expect(mediaProblems(five, "x", "X")[0]).toMatch(/at most 4/);
    expect(mediaProblems([img(), img({ id: "g", mime_type: "image/gif" })], "linkedin", "LinkedIn")[0]).toMatch(/GIF combined/);
  });
});

describe("Buffer asset input", () => {
  it("sends altText only with metadata, as the schema requires", () => {
    expect(buildImageAssets([{ url: "https://x/a.jpg", alt_text: "  " }, { url: "https://x/b.png", alt_text: "Chart" }])).toEqual([
      { image: { url: "https://x/a.jpg" } },
      { image: { url: "https://x/b.png", metadata: { altText: "Chart" } } },
    ]);
  });
  it("adds assets to createPost, and Instagram metadata only for Instagram", () => {
    const assets = [{ image: { url: "https://x/a.jpg" } }];
    const li = buildCreateInput(["Hello"], "c1", "draft", null, true, { assets, service: "linkedin" });
    expect(li.assets).toEqual(assets);
    expect(li.metadata).toBeUndefined();
    const ig = buildCreateInput(["Hello"], "c2", "draft", null, true, { assets, service: "instagram" });
    expect(ig.metadata).toEqual(instagramMetadata(1));
    expect(ig.metadata?.instagram).toEqual({ type: "post", shouldShareToFeed: true });
    expect(instagramMetadata(3).instagram.type).toBe("carousel");
    expect(buildCreateInput(["Hello"], "c1", "draft", null, true).assets).toBeUndefined();
  });
  it("keeps X thread metadata alongside images", () => {
    const input = buildCreateInput(["a", "b"], "c1", "draft", null, false, { assets: [{ image: { url: "u" } }], service: "twitter" });
    expect(input.metadata?.twitter?.thread).toHaveLength(2);
    expect(input.assets).toHaveLength(1);
  });
});

describe("preflight with media", () => {
  const asset = { body: "Caption", thread_parts: null, status: "approved" as const, guardian_status: "pass" as const };
  const ig = { channel_id: "ig", name: "My IG", service: "instagram", is_disconnected: false, is_locked: false };
  const req = { channelIds: ["ig"], mode: "draft" as const, dueAt: null, acknowledgeUnchecked: false };
  const NOW = new Date("2026-11-19T12:00:00Z");
  it("keeps the Instagram block without media and lifts it with valid media", () => {
    expect(preflight(asset, [], [ig], req, NOW)[0].message).toMatch(/requires an image/);
    expect(preflight(asset, [], [ig], req, NOW, [img()])).toEqual([]);
    expect(preflight(asset, [], [ig], req, NOW, [img({ mime_type: "image/gif" })])[0].message).toMatch(/GIF/);
  });
});

describe("Guardian media rules", () => {
  const base: RuleInput = { body: "A clear caption.", threadParts: null, platform: "instagram", wordsToAvoid: [], supportingTexts: [], otherBodies: [], hasResearch: false, linkedSourceCount: 0 };
  const types = (over: Partial<RuleInput>) => runRuleChecks({ ...base, ...over }).map((i) => `${i.issue_type}:${i.severity}`);
  it("flags missing media, then invalid media, then missing alt text", () => {
    expect(types({})).toContain("missing_media:warning");
    expect(types({ media: [img()] })).not.toContain("missing_media:warning");
    expect(types({ media: [img({ width: 400, height: 1200 })] })).toContain("invalid_media:warning");
    expect(types({ media: [img({ alt_text: "" })] })).toContain("media_alt_text:info");
    expect(types({ platform: "linkedin", media: [img()] })).toEqual([]);
  });
});
