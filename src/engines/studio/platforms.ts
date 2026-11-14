import type { Platform } from "@/types/domain";

/**
 * Platform adapters. Limits reflect each platform's published constraints as of
 * this build; they are centralized here so they can be re-verified and updated
 * in one place (see KNOWN_LIMITATIONS.md).
 */
export interface PlatformSpec {
  id: Platform;
  label: string;
  /** Hard character limit for a single post (null = no practical limit). */
  maxChars: number | null;
  /** How characters are counted. */
  counting: "chars" | "x_weighted" | "graphemes";
  /** Length the copy should aim for. */
  idealRange: [number, number];
  supportsThreads: boolean;
  requiresMedia: boolean;
  maxHashtags: number | null;
  /** Buffer service identifiers that map to this platform. */
  bufferServices: string[];
  guidance: string;
}

export const PLATFORMS: Record<Platform, PlatformSpec> = {
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    maxChars: 3000,
    counting: "chars",
    idealRange: [700, 1800],
    supportsThreads: false,
    requiresMedia: false,
    maxHashtags: 5,
    bufferServices: ["linkedin"],
    guidance:
      "Professional analysis. Open with a specific, concrete first line (it is truncated after ~210 characters in the feed). Short paragraphs separated by blank lines. Clear point of view, evidence, and a closing question or takeaway. At most 3 hashtags, only if genuinely useful. No emoji bullets.",
  },
  x: {
    id: "x",
    label: "X",
    maxChars: 280,
    counting: "x_weighted",
    idealRange: [120, 270],
    supportsThreads: true,
    requiresMedia: false,
    maxHashtags: 2,
    bufferServices: ["twitter", "x"],
    guidance:
      "Concise and punchy. One idea per post. Each post must stand alone within 280 characters (links count as 23). Use a short thread (2-5 posts) only if the idea needs it. Hashtags rarely; never more than 1-2.",
  },
  threads: {
    id: "threads",
    label: "Threads",
    maxChars: 500,
    counting: "chars",
    idealRange: [150, 450],
    supportsThreads: false,
    requiresMedia: false,
    maxHashtags: 1,
    bufferServices: ["threads"],
    guidance: "Conversational, casual-professional. Invite replies. Up to 500 characters. At most one topic tag.",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    maxChars: 63206,
    counting: "chars",
    idealRange: [200, 900],
    supportsThreads: false,
    requiresMedia: false,
    maxHashtags: 3,
    bufferServices: ["facebook"],
    guidance: "Approachable and community-oriented. Explain context for a general audience. Encourage discussion.",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    maxChars: 2200,
    counting: "chars",
    idealRange: [300, 1200],
    supportsThreads: false,
    requiresMedia: true,
    maxHashtags: 30,
    bufferServices: ["instagram"],
    guidance:
      "Caption for an image or carousel. Strong first line, line breaks for readability, clear takeaway. Include a short visual concept for the accompanying image. A few relevant hashtags at the end are acceptable.",
  },
  bluesky: {
    id: "bluesky",
    label: "Bluesky",
    maxChars: 300,
    counting: "graphemes",
    idealRange: [120, 290],
    supportsThreads: false,
    requiresMedia: false,
    maxHashtags: 2,
    bufferServices: ["bluesky"],
    guidance: "Thoughtful, conversational, 300 characters max. No hashtag stuffing.",
  },
  mastodon: {
    id: "mastodon",
    label: "Mastodon",
    maxChars: 500,
    counting: "chars",
    idealRange: [150, 480],
    supportsThreads: false,
    requiresMedia: false,
    maxHashtags: 4,
    bufferServices: ["mastodon"],
    guidance: "Community-minded and substantive. CamelCase hashtags for accessibility. 500 characters on most instances.",
  },
  newsletter: {
    id: "newsletter",
    label: "Newsletter",
    maxChars: null,
    counting: "chars",
    idealRange: [1500, 5000],
    supportsThreads: false,
    requiresMedia: false,
    maxHashtags: 0,
    bufferServices: [],
    guidance: "Long-form draft with a headline, short intro, sections with subheadings, and source links listed at the end.",
  },
  generic: {
    id: "generic",
    label: "General",
    maxChars: null,
    counting: "chars",
    idealRange: [200, 1500],
    supportsThreads: false,
    requiresMedia: false,
    maxHashtags: 3,
    bufferServices: [],
    guidance: "Clear, natural social copy.",
  },
};

export const GENERATABLE_PLATFORMS: Platform[] = ["linkedin", "x", "threads", "facebook", "instagram", "bluesky", "mastodon", "newsletter"];

const URL_RE = /https?:\/\/[^\s)]+/g;

export function countCharacters(text: string, platform: Platform): number {
  const spec = PLATFORMS[platform];
  if (spec.counting === "x_weighted") {
    // X counts every URL as 23 characters (t.co wrapping).
    const withoutUrls = text.replace(URL_RE, "");
    const urls = text.match(URL_RE)?.length ?? 0;
    return [...withoutUrls].length + urls * 23;
  }
  if (spec.counting === "graphemes" && typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(text)].length;
  }
  return [...text].length;
}

export function countHashtags(text: string): number {
  return text.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0;
}

export function countEmoji(text: string): number {
  return text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
}

/** Map a Buffer channel's `service` string to an ORBIT platform. */
export function platformForService(service: string): Platform | null {
  const s = service.toLowerCase();
  for (const spec of Object.values(PLATFORMS)) if (spec.bufferServices.includes(s)) return spec.id;
  return null;
}

/** First (or only) post of a piece of content. */
export function publishableText(body: string, threadParts: string[] | null): string {
  if (threadParts && threadParts.length > 0) return threadParts[0];
  return body;
}

/**
 * Posts actually sent to a channel. X threads go to Buffer as a real thread (every part);
 * on any other platform only the first part is sent.
 */
export function publishableParts(body: string, threadParts: string[] | null, platform: Platform | null): string[] {
  const parts = (threadParts ?? []).map((p) => p.trim()).filter(Boolean);
  if (platform === "x" && parts.length > 1) return parts;
  return [publishableText(body, threadParts)];
}
