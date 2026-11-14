import "server-only";
import { XMLParser } from "fast-xml-parser";
import { safeFetch } from "./safe-fetch";

export interface FeedItem {
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string | null;
}

export interface ParsedFeed {
  title: string | null;
  items: FeedItem[];
}

function text(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value && "#text" in value) return text((value as Record<string, unknown>)["#text"]);
  return null;
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 800) || null;
}

function iso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Parses RSS 2.0 and Atom documents. Exported for unit tests. */
export function parseFeed(xml: string): ParsedFeed {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml) as Record<string, unknown>;

  const rss = doc.rss as Record<string, unknown> | undefined;
  if (rss?.channel) {
    const channel = rss.channel as Record<string, unknown>;
    const items = asArray(channel.item as Record<string, unknown> | Record<string, unknown>[]).map((item) => ({
      title: text(item.title) ?? "Untitled",
      url: text(item.link) ?? text(item.guid) ?? "",
      publishedAt: iso(text(item.pubDate) ?? text(item["dc:date"])),
      summary: stripHtml(text(item.description)),
    }));
    return { title: text(channel.title), items: items.filter((i) => /^https?:\/\//.test(i.url)) };
  }

  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed) {
    const entries = asArray(feed.entry as Record<string, unknown> | Record<string, unknown>[]).map((entry) => {
      const links = asArray(entry.link as Record<string, string> | Record<string, string>[]);
      const alternate = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      return {
        title: text(entry.title) ?? "Untitled",
        url: alternate?.["@_href"] ?? "",
        publishedAt: iso(text(entry.published) ?? text(entry.updated)),
        summary: stripHtml(text(entry.summary) ?? text(entry.content)),
      };
    });
    return { title: text(feed.title), items: entries.filter((i) => /^https?:\/\//.test(i.url)) };
  }

  throw new Error("This does not look like an RSS or Atom feed.");
}

export async function fetchFeed(url: string): Promise<ParsedFeed> {
  const res = await safeFetch(url, { accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9" });
  if (res.status >= 400) throw new Error(`The feed responded with HTTP ${res.status}.`);
  return parseFeed(res.body);
}
