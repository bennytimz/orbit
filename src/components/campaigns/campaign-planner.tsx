"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, List, Loader2, Send, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ContentStatusPill, GuardianPill, NativeSelect, OperationPill, Pill } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { removeCampaignAsset, updateCampaignAsset } from "@/app/actions/campaigns";
import { PLATFORMS, platformForService } from "@/engines/studio/platforms";
import { formatDateTime, utcToZonedLocal, zonedLocalToUtc } from "@/lib/format";
import type { BufferChannelRow, CampaignPhase, ContentAsset } from "@/types/domain";
import { cn } from "@/lib/utils";

export interface PlannerItem {
  id: string;
  phase: string | null;
  scheduled_at: string | null;
  channel_ids: string[];
  status: string;
  asset: Pick<ContentAsset, "id" | "title" | "body" | "platform" | "status" | "guardian_status">;
  publications: { status: string; postId: string | null; channel: string | null }[];
}

type Channel = Pick<BufferChannelRow, "channel_id" | "name" | "display_name" | "service">;

const ITEM_STATUS: Record<string, string> = {
  planned: "Planned",
  approved: "Approved",
  sent_to_buffer: "Sent to Buffer",
  partially_sent: "Partially sent",
  failed: "Send failed",
};

function ItemRow({ item, phases, channels, timeZone }: { item: PlannerItem; phases: CampaignPhase[]; channels: Channel[]; timeZone: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState(item.phase ?? "");
  const [local, setLocal] = useState(item.scheduled_at ? utcToZonedLocal(item.scheduled_at, timeZone) : "");
  const [chosen, setChosen] = useState<string[]>(item.channel_ids);
  const update = useAction(updateCampaignAsset);
  const remove = useAction(removeCampaignAsset);
  const matching = channels.filter((c) => platformForService(c.service) === item.asset.platform);
  const others = channels.filter((c) => platformForService(c.service) !== item.asset.platform);
  const dirty = phase !== (item.phase ?? "") || local !== (item.scheduled_at ? utcToZonedLocal(item.scheduled_at, timeZone) : "") || JSON.stringify(chosen) !== JSON.stringify(item.channel_ids);

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{PLATFORMS[item.asset.platform].label}</span>
            <ContentStatusPill status={item.asset.status} />
            <GuardianPill status={item.asset.guardian_status} />
            <Pill tone={item.status === "sent_to_buffer" ? "success" : item.status === "failed" ? "danger" : item.status === "partially_sent" ? "warning" : "neutral"}>{ITEM_STATUS[item.status] ?? item.status}</Pill>
          </div>
          <Link href={`/studio/${item.asset.id}`} className="font-medium hover:text-primary">
            {item.asset.title}
          </Link>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.asset.body}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Remove from campaign" disabled={remove.pending} onClick={async () => (await remove.run(item.id)).ok && router.refresh()}>
          <X />
        </Button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[180px_220px_1fr]">
        <NativeSelect aria-label="Phase" value={phase} onChange={(e) => setPhase(e.target.value)}>
          <option value="">No phase</option>
          {phases.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <Input type="datetime-local" aria-label="Planned date and time" value={local} onChange={(e) => setLocal(e.target.value)} />
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {[...matching, ...others].map((c) => (
            <label key={c.channel_id} className={cn("flex items-center gap-1.5 text-sm", !matching.includes(c) && "text-muted-foreground")}>
              <Checkbox checked={chosen.includes(c.channel_id)} onCheckedChange={(v) => setChosen(v ? [...chosen, c.channel_id] : chosen.filter((x) => x !== c.channel_id))} />
              {c.display_name ?? c.name}
            </label>
          ))}
          {!channels.length ? <span className="text-xs text-muted-foreground">Connect Buffer to choose channels.</span> : null}
        </div>
      </div>
      {item.publications.length ? (
        <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
          {item.publications.map((p, i) => (
            <li key={i} className="flex items-center gap-2">
              <OperationPill status={p.status} />
              <span>{p.channel}</span>
              {p.postId ? <span className="font-mono text-muted-foreground">Buffer ID {p.postId}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || update.pending}
          onClick={async () => {
            const scheduled = local ? zonedLocalToUtc(local, timeZone) : null;
            const r = await update.run(item.id, { phase: phase || null, scheduled_at: scheduled, channel_ids: chosen });
            if (r.ok) router.refresh();
          }}
        >
          {update.pending ? <Loader2 className="animate-spin" /> : null} Save plan
        </Button>
        <span className="text-xs text-muted-foreground">Plan changes are local to ORBIT and never alter posts already in Buffer.</span>
        <Link href={`/studio/${item.asset.id}`} className={buttonVariants({ size: "sm", className: "ml-auto" })}>
          <Send /> Review & send
        </Link>
      </div>
    </li>
  );
}

function monthMatrix(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const startDay = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function zonedDateKey(iso: string, timeZone: string) {
  return utcToZonedLocal(iso, timeZone).slice(0, 10);
}

export function CampaignPlanner({ items, phases, channels, timeZone, startDate }: { items: PlannerItem[]; phases: CampaignPhase[]; channels: Channel[]; timeZone: string; startDate: string | null }) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const firstScheduled = items.map((i) => i.scheduled_at).filter(Boolean).sort()[0];
  const anchor = firstScheduled ? zonedDateKey(firstScheduled, timeZone) : startDate ?? new Date().toISOString().slice(0, 10);
  const [ym, setYm] = useState({ y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) - 1 });

  const byDay = useMemo(() => {
    const map = new Map<string, PlannerItem[]>();
    for (const i of items) {
      if (!i.scheduled_at) continue;
      const k = zonedDateKey(i.scheduled_at, timeZone);
      map.set(k, [...(map.get(k) ?? []), i]);
    }
    return map;
  }, [items, timeZone]);

  const grouped = useMemo(() => {
    const groups: { key: string; name: string; description?: string; items: PlannerItem[] }[] = phases.map((p) => ({ key: p.key, name: p.name, description: p.description, items: [] }));
    const none: (typeof groups)[number] = { key: "", name: "Unassigned", items: [] };
    for (const i of items) (groups.find((g) => g.key === i.phase) ?? none).items.push(i);
    return [...groups, none].filter((g) => g.items.length || g.key);
  }, [items, phases]);

  const unscheduled = items.filter((i) => !i.scheduled_at);

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
        <button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", view === "list" ? "bg-background" : "text-muted-foreground")}>
          <List className="size-4" /> Phases
        </button>
        <button type="button" onClick={() => setView("calendar")} aria-pressed={view === "calendar"} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", view === "calendar" ? "bg-background" : "text-muted-foreground")}>
          <CalendarDays className="size-4" /> Calendar
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No content in this campaign yet. Generate content or add existing drafts below.</p>
      ) : view === "list" ? (
        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.key || "none"}>
              <h3 className="text-sm font-semibold">
                {g.name} <span className="font-normal text-muted-foreground">({g.items.length})</span>
              </h3>
              {g.description ? <p className="mb-2 text-xs text-muted-foreground">{g.description}</p> : null}
              {g.items.length ? (
                <ul className="mt-2 space-y-3">
                  {g.items.map((i) => (
                    <ItemRow key={i.id} item={i} phases={phases} channels={channels} timeZone={timeZone} />
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Nothing in this phase yet.</p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setYm(ym.m === 0 ? { y: ym.y - 1, m: 11 } : { y: ym.y, m: ym.m - 1 })}>
              <ChevronLeft />
            </Button>
            <span className="w-40 text-center text-sm font-medium">{new Date(Date.UTC(ym.y, ym.m, 15)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setYm(ym.m === 11 ? { y: ym.y + 1, m: 0 } : { y: ym.y, m: ym.m + 1 })}>
              <ChevronRight />
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">Times in {timeZone}. Change dates in the Phases view.</span>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[700px] grid-cols-7 overflow-hidden rounded-xl border border-border text-xs">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="border-b border-border bg-muted/40 px-2 py-1.5 font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
              {monthMatrix(ym.y, ym.m).map((d, idx) => {
                const key = d ? `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
                const dayItems = d ? byDay.get(key) ?? [] : [];
                return (
                  <div key={idx} className={cn("min-h-24 border-b border-r border-border p-1.5", !d && "bg-muted/20")}>
                    {d ? <span className="text-muted-foreground">{d}</span> : null}
                    <ul className="mt-1 space-y-1">
                      {dayItems.map((i) => (
                        <li key={i.id}>
                          <Link
                            href={`/studio/${i.asset.id}`}
                            className={cn("block truncate rounded px-1.5 py-0.5", i.status === "sent_to_buffer" ? "bg-success/15 text-success" : "bg-primary/15 text-primary")}
                            title={`${i.asset.title} — ${formatDateTime(i.scheduled_at!, timeZone)}`}
                          >
                            {PLATFORMS[i.asset.platform].label}: {i.asset.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
          {unscheduled.length ? <p className="mt-2 text-xs text-muted-foreground">{unscheduled.length} item(s) without a planned date.</p> : null}
        </div>
      )}
    </div>
  );
}
