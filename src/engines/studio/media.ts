import type { Platform } from "@/types/domain";

/**
 * Media rules for images attached to drafts.
 *
 * Buffer's API has no upload endpoint: posts carry `assets: [{ image: { url } }]`
 * pointing at a publicly reachable file that must stay reachable until the post
 * publishes (https://developers.buffer.com/guides/hosting-media.html). Buffer's
 * `MediaFormat` enum lists jpeg, png and gif for images. Buffer's `configuration`
 * query does not expose post media limits (verified live 2026-11-19, see
 * notes/buffer-schema-2026-11.md), so the per-platform counts and ratios below
 * come from each platform's commonly documented limits and are centralized here
 * for re-verification (KNOWN_LIMITATIONS.md).
 */

export type MediaMime = "image/jpeg" | "image/png" | "image/gif";

export const MEDIA_MIME_TYPES: readonly MediaMime[] = ["image/jpeg", "image/png", "image/gif"];

/** Upload cap. Also the storage bucket's file_size_limit; keeps requests under Vercel's 4.5 MB body limit. */
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

/** Maximum images ORBIT stores per draft. */
export const MAX_MEDIA_PER_ASSET = 10;

export interface PlatformMediaRule {
  /** Images required for a post (0 = optional). */
  minImages: number;
  maxImages: number;
  formats: readonly MediaMime[];
  /** An animated GIF must be the only image. */
  gifAlone: boolean;
  /** Allowed width/height ratio, when the platform restricts it. */
  aspectRatio: { min: number; max: number; label: string } | null;
}

const COMMON: PlatformMediaRule = { minImages: 0, maxImages: 4, formats: MEDIA_MIME_TYPES, gifAlone: true, aspectRatio: null };

export const MEDIA_RULES: Record<Platform, PlatformMediaRule | null> = {
  linkedin: { ...COMMON, maxImages: 9 },
  x: { ...COMMON, maxImages: 4 },
  threads: { ...COMMON, maxImages: 10 },
  facebook: { ...COMMON, maxImages: 10 },
  instagram: {
    minImages: 1,
    maxImages: 10,
    formats: ["image/jpeg", "image/png"],
    gifAlone: true,
    aspectRatio: { min: 0.8, max: 1.91, label: "between 4:5 (portrait) and 1.91:1 (landscape)" },
  },
  bluesky: { ...COMMON, maxImages: 4, formats: ["image/jpeg", "image/png"] },
  mastodon: { ...COMMON, maxImages: 4 },
  // Not Buffer channels: media is never sent.
  newsletter: null,
  generic: null,
};

export interface MediaInfo {
  id: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string;
}

const FORMAT_LABEL: Record<string, string> = { "image/jpeg": "JPEG", "image/png": "PNG", "image/gif": "GIF" };

export function formatLabel(mime: string): string {
  return FORMAT_LABEL[mime] ?? mime;
}

/** Problems that would make Buffer or the network reject this media on the platform. Empty = valid. */
export function mediaProblems(media: MediaInfo[], platform: Platform, platformLabel: string): string[] {
  const rule = MEDIA_RULES[platform];
  if (!rule) return [];
  const out: string[] = [];
  if (media.length < rule.minImages) {
    out.push(`${platformLabel} requires at least ${rule.minImages} image${rule.minImages === 1 ? "" : "s"}. Attach one in the Media section.`);
  }
  if (media.length > rule.maxImages) out.push(`${platformLabel} accepts at most ${rule.maxImages} images (this draft has ${media.length}).`);
  const gifs = media.filter((m) => m.mime_type === "image/gif");
  if (rule.gifAlone && gifs.length && media.length > 1) out.push(`${platformLabel} does not allow a GIF combined with other images.`);
  media.forEach((m, i) => {
    const n = media.length > 1 ? `Image ${i + 1}` : "The image";
    if (!rule.formats.includes(m.mime_type as MediaMime)) {
      out.push(`${n} is ${formatLabel(m.mime_type)}; ${platformLabel} accepts ${rule.formats.map(formatLabel).join(", ")}.`);
    }
    if (m.size_bytes > MAX_MEDIA_BYTES) out.push(`${n} is larger than ${MAX_MEDIA_BYTES / 1024 / 1024} MB.`);
    if (rule.aspectRatio && m.width && m.height) {
      const ratio = m.width / m.height;
      if (ratio < rule.aspectRatio.min - 0.01 || ratio > rule.aspectRatio.max + 0.01) {
        out.push(`${n} is ${m.width}×${m.height}; ${platformLabel} needs an aspect ratio ${rule.aspectRatio.label}.`);
      }
    }
  });
  return out;
}

/** True when the platform needs media and this draft's media satisfies every rule. */
export function mediaSatisfies(media: MediaInfo[], platform: Platform, platformLabel: string): boolean {
  return mediaProblems(media, platform, platformLabel).length === 0;
}

/** Detects the real image type from the file's first bytes (never trusts the browser's claim). */
export function sniffImageMime(bytes: Uint8Array): MediaMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return "image/gif";
  }
  return null;
}

/** Reads pixel dimensions from PNG, GIF or JPEG headers. Null when they can't be read. */
export function readImageDimensions(bytes: Uint8Array, mime: MediaMime): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png") {
    if (bytes.length < 24) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === "image/gif") {
    if (bytes.length < 10) return null;
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  // JPEG: walk segments until a Start-Of-Frame marker (C0–CF except C4, C8, CC).
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = view.getUint16(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    }
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

export interface BufferImageAsset {
  image: { url: string; metadata?: { altText: string } };
}

/** Builds Buffer `AssetInput` entries. `metadata.altText` is required whenever metadata is sent, so it is sent only with alt text. */
export function buildImageAssets(media: { url: string; alt_text: string }[]): BufferImageAsset[] {
  return media.map((m) => {
    const alt = m.alt_text.trim();
    return alt ? { image: { url: m.url, metadata: { altText: alt.slice(0, 1000) } } } : { image: { url: m.url } };
  });
}

/** Instagram posts need `metadata.instagram` with a post type and feed sharing (InstagramPostMetadataInput). */
export function instagramMetadata(imageCount: number): { instagram: { type: "post" | "carousel"; shouldShareToFeed: true } } {
  return { instagram: { type: imageCount > 1 ? "carousel" : "post", shouldShareToFeed: true } };
}
