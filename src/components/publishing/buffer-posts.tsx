"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice, Pill } from "@/components/shared";
import { listBufferPosts } from "@/app/actions/publishing";
import type { BufferPost, BufferPostStatus } from "@/lib/buffer/operations";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS: { id: string; label: string; statuses: BufferPostStatus[] }[] = [
  { id: "scheduled", label: "Scheduled", statuses: ["scheduled", "needs_approval"] },
  { id: "drafts", label: "Drafts", statuses: ["draft"] },
  { id: "sent", label: "Sent", statuses: ["sent", "sending"] },
  { id: "error", label: "Failed", statuses: ["error"] },
];

export function BufferPostsBrowser({ channels, timeZone }: { channels: { id: string; name: string }[]; timeZone: string }) {
  const [tab, setTab] = useState(TABS[0]);
  const [posts, setPosts] = useState<BufferPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (after?: string) => {
      setLoading(true);
      setError(null);
      try {
        const r = await listBufferPosts(tab.statuses, after);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setPosts((prev) => (after ? [...prev, ...r.data.posts] : r.data.posts));
        setHasMore(r.data.hasNextPage);
        setCursor(r.data.endCursor);
      } catch {
        setError("Could not load posts from Buffer.");
      } finally {
        setLoading(false);
      }
    },
    [tab],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center gap-1 border-b border-border p-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab.id === t.id}
            className={cn("rounded-md px-3 py-1.5 text-sm", tab.id === t.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
        <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Reload" onClick={() => load()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
        </Button>
      </div>
      <div className="p-3">
        {error ? (
          <Notice tone="danger">{error}</Notice>
        ) : loading && !posts.length ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading from Buffer…
          </p>
        ) : posts.length ? (
          <ul className="divide-y divide-border">
            {posts.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                <div className="w-44 shrink-0 text-xs text-muted-foreground">
                  {p.dueAt ? formatDateTime(p.dueAt, timeZone) : "No time set"}
                  <span className="block">{channelName(p.channelId)}</span>
                </div>
                <p className="line-clamp-3 flex-1 text-sm">{p.text ?? <span className="text-muted-foreground">(no text)</span>}</p>
                <Pill>{p.status.replace("_", " ")}</Pill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">No {tab.label.toLowerCase()} posts in Buffer.</p>
        )}
        {hasMore && !error ? (
          <Button variant="ghost" size="sm" className="mt-2" disabled={loading} onClick={() => load(cursor ?? undefined)}>
            {loading ? <Loader2 className="animate-spin" /> : null} Load more
          </Button>
        ) : null}
      </div>
    </div>
  );
}
