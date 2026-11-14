"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Link2, Loader2, Rss, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "@/hooks/use-action";
import { addFeed, discoverFromUrls, discoverWeb, removeFeed, scanFeeds } from "@/app/actions/radar";
import { relativeTime } from "@/lib/format";
import type { ResearchFeed } from "@/types/domain";

function Working({ label }: { label: string }) {
  return (
    <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" /> {label} This can take up to a minute — you can keep working elsewhere.
    </p>
  );
}

export function DiscoverPanel({ feeds, webSearchAvailable }: { feeds: ResearchFeed[]; webSearchAvailable: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [urls, setUrls] = useState("");
  const [focus, setFocus] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const web = useAction(discoverWeb);
  const fromUrls = useAction(discoverFromUrls);
  const feedAdd = useAction(addFeed);
  const feedRemove = useAction(removeFeed);
  const scan = useAction(scanFeeds);

  return (
    <section className="rounded-xl border border-border bg-card p-5" aria-label="Discover">
      <Tabs defaultValue={webSearchAvailable ? "web" : "url"}>
        <TabsList>
          <TabsTrigger value="url">
            <Link2 /> From URLs
          </TabsTrigger>
          <TabsTrigger value="web">
            <Globe /> Web search
          </TabsTrigger>
          <TabsTrigger value="rss">
            <Rss /> Feeds
          </TabsTrigger>
        </TabsList>

        <TabsContent value="web" className="pt-3">
          {webSearchAvailable ? (
            <>
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await web.run(query);
                  if (r.ok) {
                    setQuery("");
                    router.refresh();
                  }
                }}
              >
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="A topic, or leave empty to scan your interests"
                  aria-label="Research topic"
                  maxLength={300}
                />
                <Button type="submit" disabled={web.pending} className="shrink-0">
                  {web.pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  Discover
                </Button>
              </form>
              {web.pending ? (
                <Working label="Searching the web and analyzing sources." />
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Uses the AI provider&apos;s web search. Only URLs actually returned by the search are kept as sources.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Web search isn&apos;t available with the current AI provider (Gemini). Research a topic by pasting article URLs under “From URLs”, or by following RSS/Atom feeds
              under “Feeds”.
            </p>
          )}
        </TabsContent>

        <TabsContent value="url" className="pt-3">
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const list = urls
                .split(/\s+/)
                .map((u) => u.trim())
                .filter(Boolean);
              const r = await fromUrls.run(list, focus);
              if (r.ok) {
                r.data.failures.forEach((f) => toast.warning(`Skipped ${f.url}: ${f.reason}`));
                setUrls("");
                router.refresh();
              }
            }}
          >
            <Textarea value={urls} onChange={(e) => setUrls(e.target.value)} rows={3} placeholder={"https://example.com/article\nOne URL per line (up to 5)"} aria-label="URLs" />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional: what are you looking for in these?" aria-label="Focus" />
              <Button type="submit" disabled={fromUrls.pending || !urls.trim()} className="shrink-0">
                {fromUrls.pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Analyze
              </Button>
            </div>
          </form>
          {fromUrls.pending ? <Working label="Fetching pages (respecting robots.txt) and analyzing." /> : null}
        </TabsContent>

        <TabsContent value="rss" className="space-y-3 pt-3">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await feedAdd.run(feedUrl);
              if (r.ok) {
                setFeedUrl("");
                router.refresh();
              }
            }}
          >
            <Input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://example.com/feed.xml" aria-label="Feed URL" type="url" />
            <Button type="submit" variant="outline" disabled={feedAdd.pending || !feedUrl.trim()} className="shrink-0">
              {feedAdd.pending ? <Loader2 className="animate-spin" /> : null}
              Follow feed
            </Button>
          </form>
          {feeds.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {feeds.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{f.title ?? f.url}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {f.last_error ? (
                        <span className="text-destructive">Last error: {f.last_error}</span>
                      ) : f.last_fetched_at ? (
                        `Scanned ${relativeTime(f.last_fetched_at)}`
                      ) : (
                        "Not scanned yet"
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Unfollow ${f.title ?? f.url}`}
                    disabled={feedRemove.pending}
                    onClick={async () => (await feedRemove.run(f.id)).ok && router.refresh()}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Follow RSS or Atom feeds from publications, blogs, or GitHub releases (e.g. https://github.com/owner/repo/releases.atom).
            </p>
          )}
          <Button onClick={async () => (await scan.run()).ok && router.refresh()} disabled={scan.pending || !feeds.length}>
            {scan.pending ? <Loader2 className="animate-spin" /> : <Rss />}
            Scan feeds
          </Button>
          {scan.pending ? <Working label="Reading feeds and analyzing recent items." /> : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}
