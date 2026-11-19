import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import type { MediaInfo } from "@/engines/studio/media";

/**
 * Private Supabase Storage bucket for draft media. It has no storage.objects
 * policies, so only this trusted server code (service role) touches files, and
 * every call is scoped to the authenticated user's id. Object paths are
 * `<user_id>/<content_asset_id>/<uuid>.<ext>`.
 */
export const MEDIA_BUCKET = "orbit-media";

/** Preview links shown in ORBIT's own UI. */
export const PREVIEW_URL_TTL_SECONDS = 60 * 60;

/**
 * Links handed to Buffer. Buffer fetches media when the post publishes, which
 * can be days or weeks later, so a short-lived link would make the post fail.
 * The link is an unguessable capability URL for that single file only.
 */
export const BUFFER_URL_TTL_SECONDS = 365 * 24 * 60 * 60;

export interface ContentMediaRow extends MediaInfo {
  user_id: string;
  content_asset_id: string;
  storage_path: string;
  position: number;
  created_at: string;
}

export async function listAssetMedia(supabase: SupabaseClient, userId: string, assetId: string): Promise<ContentMediaRow[]> {
  const { data, error } = await supabase
    .from("content_media")
    .select("*")
    .eq("user_id", userId)
    .eq("content_asset_id", assetId)
    .order("position")
    .order("created_at");
  // Before the migration is applied the table is missing: behave as "no media".
  if (error) return [];
  return (data as ContentMediaRow[]) ?? [];
}

export async function signedUrls(paths: string[], ttlSeconds: number): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;
  const { data, error } = await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUrls(paths, ttlSeconds);
  if (error) throw new Error(`Could not create media links: ${error.message}`);
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

export async function uploadObject(path: string, bytes: Uint8Array, mime: string): Promise<void> {
  const { error } = await createAdminClient().storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(`Could not store the image: ${error.message}`);
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await createAdminClient().storage.from(MEDIA_BUCKET).remove(paths);
  if (error) throw new Error(`Could not delete the stored image: ${error.message}`);
}
