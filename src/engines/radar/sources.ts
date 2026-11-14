import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResearchSource } from "@/types/domain";
import { parseSourceDate } from "./relevance";

export interface SourceInput {
  url: string;
  title: string | null;
  publisher?: string | null;
  publishedAtText?: string | null;
  publishedAtIso?: string | null;
  provider: ResearchSource["provider"];
  excerpt?: string | null;
  contentHash?: string | null;
  fetchStatus?: ResearchSource["fetch_status"];
}

export function publisherFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/** Upserts sources by (user_id, url) and returns them keyed by URL. */
export async function upsertSources(supabase: SupabaseClient, userId: string, inputs: SourceInput[]): Promise<Map<string, ResearchSource>> {
  const unique = new Map<string, SourceInput>();
  for (const s of inputs) if (!unique.has(s.url)) unique.set(s.url, s);
  if (!unique.size) return new Map();

  // Preserve existing excerpts when a new retrieval has none.
  const { data: existing } = await supabase
    .from("research_sources")
    .select("*")
    .eq("user_id", userId)
    .in("url", [...unique.keys()]);
  const existingByUrl = new Map(((existing as ResearchSource[] | null) ?? []).map((s) => [s.url, s]));

  const rows = [...unique.values()].map((s) => {
    const prior = existingByUrl.get(s.url);
    const parsed = s.publishedAtIso ?? parseSourceDate(s.publishedAtText)?.toISOString() ?? null;
    return {
      user_id: userId,
      url: s.url,
      title: s.title ?? prior?.title ?? null,
      publisher: s.publisher ?? prior?.publisher ?? publisherFromUrl(s.url),
      published_at: parsed ?? prior?.published_at ?? null,
      published_at_text: s.publishedAtText ?? prior?.published_at_text ?? null,
      retrieved_at: new Date().toISOString(),
      provider: prior?.provider ?? s.provider,
      excerpt: s.excerpt && s.excerpt.trim() ? s.excerpt : (prior?.excerpt ?? null),
      content_hash: s.contentHash ?? prior?.content_hash ?? null,
      fetch_status: s.fetchStatus ?? prior?.fetch_status ?? "not_fetched",
    };
  });

  const { data, error } = await supabase.from("research_sources").upsert(rows, { onConflict: "user_id,url" }).select("*");
  if (error) throw new Error(`Could not save sources: ${error.message}`);
  return new Map(((data as ResearchSource[] | null) ?? []).map((s) => [s.url, s]));
}
