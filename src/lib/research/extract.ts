import "server-only";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { sha256Hex } from "@/lib/security/crypto";
import { FetchBlockedError, isAllowedByRobots, safeFetch } from "./safe-fetch";

export interface ExtractedArticle {
  url: string;
  title: string | null;
  publisher: string | null;
  publishedAt: string | null; // ISO string when a machine-readable date was found
  text: string;
  contentHash: string;
}

export type ExtractOutcome =
  | { ok: true; article: ExtractedArticle }
  | { ok: false; status: "blocked" | "failed"; reason: string };

const MAX_TEXT = 24_000;

function meta(document: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const value = el?.getAttribute("content") ?? el?.getAttribute("datetime") ?? null;
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Fetches a public article (respecting robots.txt) and extracts readable text. */
export async function extractArticle(url: string): Promise<ExtractOutcome> {
  try {
    if (!(await isAllowedByRobots(url))) {
      return { ok: false, status: "blocked", reason: "The site's robots.txt disallows automated access to this page." };
    }
    const res = await safeFetch(url);
    if (res.status >= 400) return { ok: false, status: "failed", reason: `The source responded with HTTP ${res.status}.` };
    if (!/html|xml|text\/plain/i.test(res.contentType)) {
      return { ok: false, status: "failed", reason: `Unsupported content type (${res.contentType || "unknown"}).` };
    }
    if (/text\/plain/i.test(res.contentType)) {
      const text = res.body.slice(0, MAX_TEXT);
      return { ok: true, article: { url: res.finalUrl, title: null, publisher: new URL(res.finalUrl).hostname, publishedAt: null, text, contentHash: sha256Hex(text) } };
    }
    const { document } = parseHTML(res.body);
    const title = meta(document as unknown as Document, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ?? document.querySelector("title")?.textContent?.trim() ?? null;
    const publisher = meta(document as unknown as Document, ['meta[property="og:site_name"]', 'meta[name="application-name"]']) ?? new URL(res.finalUrl).hostname.replace(/^www\./, "");
    const publishedAt = toIso(
      meta(document as unknown as Document, [
        'meta[property="article:published_time"]',
        'meta[name="article:published_time"]',
        'meta[name="pubdate"]',
        'meta[name="date"]',
        'meta[itemprop="datePublished"]',
        "time[datetime]",
      ]),
    );
    let text = "";
    try {
      const article = new Readability(document as unknown as Document).parse();
      text = article?.textContent ?? "";
    } catch {
      text = "";
    }
    if (!text.trim()) text = document.body?.textContent ?? "";
    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT);
    if (text.length < 200) return { ok: false, status: "failed", reason: "Could not extract readable text from the page." };
    return { ok: true, article: { url: res.finalUrl, title, publisher, publishedAt, text, contentHash: sha256Hex(text) } };
  } catch (error) {
    if (error instanceof FetchBlockedError) return { ok: false, status: "blocked", reason: error.message };
    return { ok: false, status: "failed", reason: error instanceof Error ? error.message : "Unknown fetch error." };
  }
}

/** Normalizes text for passage verification (whitespace/quote/case-insensitive). */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `passage` appears (normalized) in any of the given source texts. */
export function passageAppearsIn(passage: string, texts: string[]): boolean {
  const needle = normalizeForMatch(passage).replace(/^\.\.\.|\.\.\.$/g, "").trim();
  if (needle.length < 12) return false;
  return texts.some((t) => normalizeForMatch(t).includes(needle));
}
