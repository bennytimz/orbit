import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IDEA_LOG_ACTION, recordedIdeaIds } from "./ideas";

/** Recorded Buffer Idea IDs for the given discoveries, read from the user's activity log. */
export async function findSavedIdeaIds(supabase: SupabaseClient, userId: string, discoveryIds: string[]): Promise<Record<string, string>> {
  if (discoveryIds.length === 0) return {};
  const { data, error } = await supabase
    .from("activity_logs")
    .select("resource_id, metadata")
    .eq("user_id", userId)
    .eq("action", IDEA_LOG_ACTION)
    .eq("resource_type", "discovery")
    .in("resource_id", discoveryIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not read saved Buffer Ideas: ${error.message}`);
  return recordedIdeaIds(data ?? []);
}
