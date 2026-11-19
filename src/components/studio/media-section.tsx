"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Notice } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { deleteMedia, updateMediaAltText } from "@/app/actions/media";
import { MAX_MEDIA_BYTES, MAX_MEDIA_PER_ASSET, MEDIA_RULES, formatLabel, mediaProblems } from "@/engines/studio/media";
import { PLATFORMS } from "@/engines/studio/platforms";
import type { Platform } from "@/types/domain";

export interface MediaItemView {
  id: string;
  previewUrl: string | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string;
  /** Buffer posts ORBIT created with this image. */
  sentCount: number;
}

function AltTextField({ item }: { item: MediaItemView }) {
  const [value, setValue] = useState(item.alt_text);
  const save = useAction(updateMediaAltText);
  const dirty = value.trim() !== item.alt_text;
  return (
    <form
      className="flex gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        await save.run(item.id, value);
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Describe the image (alt text)" aria-label="Alt text" maxLength={1000} className="h-8 text-xs" />
      <Button type="submit" size="sm" variant="outline" disabled={!dirty || save.pending}>
        Save
      </Button>
    </form>
  );
}

export function MediaSection({ assetId, platform, items }: { assetId: string; platform: Platform; items: MediaItemView[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState<MediaItemView | null>(null);
  const remove = useAction(deleteMedia);
  const rule = MEDIA_RULES[platform];
  const label = PLATFORMS[platform].label;
  const problems = items.length || rule?.minImages ? mediaProblems(items, platform, label) : [];

  const upload = async (file: File) => {
    if (file.size > MAX_MEDIA_BYTES) {
      toast.error("Images must be 4 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.set("assetId", assetId);
      body.set("file", file);
      const res = await fetch("/api/media", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) toast.error(json.error ?? "Upload failed.");
      else {
        toast.success("Image attached. Add alt text so everyone can read it.");
        router.refresh();
      }
    } catch {
      toast.error("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="media-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 id="media-heading" className="text-sm font-semibold">
            Media <span className="font-normal text-muted-foreground">(optional{rule?.minImages ? `, required for ${label}` : ""})</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG or GIF up to 4 MB.{rule ? ` ${label} accepts up to ${rule.maxImages} image${rule.maxImages === 1 ? "" : "s"}.` : ""} Images are sent to Buffer with the post.
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/gif"
          className="sr-only"
          aria-label="Upload image"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={uploading || items.length >= MAX_MEDIA_PER_ASSET}>
          {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />} Add image
        </Button>
      </div>

      {items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((m, i) => (
            <li key={m.id} className="space-y-2 rounded-lg border border-border p-2">
              <div className="relative overflow-hidden rounded-md bg-muted">
                {m.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
                  <img src={m.previewUrl} alt={m.alt_text || `Attached image ${i + 1}`} className="aspect-video w-full object-contain" />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">Preview unavailable</div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {formatLabel(m.mime_type)} · {(m.size_bytes / 1024 / 1024).toFixed(2)} MB{m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
                </span>
                <Button size="icon-sm" variant="ghost" aria-label={`Remove image ${i + 1}`} onClick={() => setConfirm(m)}>
                  <Trash2 />
                </Button>
              </div>
              <AltTextField item={m} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No media attached. {rule?.minImages ? `${label} needs at least one image before it can be sent to Buffer.` : "This post will be sent as text only."}</p>
      )}

      {problems.length ? (
        <div className="mt-3">
          <Notice tone="warning" title="Media issues">
            <ul className="list-disc pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Notice>
        </div>
      ) : null}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this image?</AlertDialogTitle>
            <AlertDialogDescription>
              The file is deleted from ORBIT&apos;s storage.
              {confirm?.sentCount
                ? ` It was sent with ${confirm.sentCount} Buffer post${confirm.sentCount === 1 ? "" : "s"}. Buffer fetches the image when a post publishes, so posts that haven't published yet will lose it.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.pending}
              onClick={async () => {
                if (!confirm) return;
                const r = await remove.run(confirm.id);
                if (r.ok) {
                  setConfirm(null);
                  router.refresh();
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
