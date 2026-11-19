import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { MAX_MEDIA_BYTES, MAX_MEDIA_PER_ASSET, readImageDimensions, sniffImageMime } from "@/engines/studio/media";
import { removeObjects, uploadObject } from "@/lib/media/store";

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" } as const;

/**
 * Attaches an image to one of the signed-in user's drafts. The real type is
 * detected from the file's bytes; the browser's claimed type is ignored.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { supabase, userId } = session;

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_MEDIA_BYTES + 64 * 1024) return NextResponse.json({ error: "Images must be 4 MB or smaller." }, { status: 413 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const assetId = String(form.get("assetId") ?? "");
  const altText = String(form.get("altText") ?? "").trim().slice(0, 1000);
  const file = form.get("file");
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return NextResponse.json({ error: "Unknown draft." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  if (file.size > MAX_MEDIA_BYTES) return NextResponse.json({ error: "Images must be 4 MB or smaller." }, { status: 413 });

  // Ownership: RLS-scoped read of the draft.
  const { data: asset } = await supabase.from("content_assets").select("id").eq("id", assetId).eq("user_id", userId).maybeSingle();
  if (!asset) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  const { count, error: countError } = await supabase.from("content_media").select("id", { count: "exact", head: true }).eq("content_asset_id", assetId).eq("user_id", userId);
  if (countError) return NextResponse.json({ error: "Media storage is not set up yet (database migration pending)." }, { status: 503 });
  if ((count ?? 0) >= MAX_MEDIA_PER_ASSET) return NextResponse.json({ error: `A draft can hold at most ${MAX_MEDIA_PER_ASSET} images.` }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) return NextResponse.json({ error: "Only JPEG, PNG and GIF images are supported." }, { status: 415 });
  const dims = readImageDimensions(bytes, mime);

  const path = `${userId}/${assetId}/${randomUUID()}.${EXT[mime]}`;
  try {
    await uploadObject(path, bytes, mime);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not store the image." }, { status: 502 });
  }
  const { data: row, error } = await supabase
    .from("content_media")
    .insert({
      user_id: userId,
      content_asset_id: assetId,
      storage_path: path,
      mime_type: mime,
      size_bytes: bytes.byteLength,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      alt_text: altText,
      position: count ?? 0,
    })
    .select("id")
    .single();
  if (error || !row) {
    // Don't leave an orphaned file behind.
    await removeObjects([path]).catch(() => undefined);
    return NextResponse.json({ error: "Could not record the image." }, { status: 500 });
  }
  // Guardian's last check no longer reflects the draft's media.
  await supabase.from("content_assets").update({ guardian_status: "stale" }).eq("id", assetId).eq("user_id", userId).neq("guardian_status", "unchecked");
  await supabase.from("activity_logs").insert({ user_id: userId, action: "media_attached", resource_type: "content_asset", resource_id: assetId, metadata: { media_id: row.id, mime, size: bytes.byteLength } });
  return NextResponse.json({ id: row.id });
}
