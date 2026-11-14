"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CircleX, HelpCircle, Loader2, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GuardianPill, Notice, OperationPill, Pill } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { publishContent } from "@/app/actions/publishing";
import { PLATFORMS, countCharacters, platformForService, publishableParts, publishableText } from "@/engines/studio/platforms";
import { formatDateTime, utcToZonedLocal, zonedLocalToUtc } from "@/lib/format";
import type { BufferChannelRow, ContentAsset, GuardianIssue, PublishMode } from "@/types/domain";
import type { ChannelOutcome } from "@/engines/publisher/publish";
import { cn } from "@/lib/utils";

const MODES: { id: PublishMode; label: string; desc: string }[] = [
  { id: "draft", label: "Save as Buffer draft", desc: "Creates a draft in Buffer. Nothing is published." },
  { id: "addToQueue", label: "Add to queue", desc: "Buffer publishes at the channel's next queue slot." },
  { id: "customScheduled", label: "Schedule for a time", desc: "Buffer publishes at the time you choose." },
  { id: "shareNext", label: "Share next", desc: "Puts it at the front of the queue." },
  { id: "shareNow", label: "Share now", desc: "Buffer publishes immediately." },
];

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PublishDialog({
  asset,
  channels,
  connection,
  openIssues,
  timeZone,
  campaignAsset,
}: {
  asset: ContentAsset;
  channels: BufferChannelRow[];
  connection: { status: string; organizationName: string | null } | null;
  openIssues: GuardianIssue[];
  timeZone: string;
  campaignAsset: { id: string; scheduled_at: string | null; channel_ids: string[] } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"configure" | "confirm" | "result">("configure");
  const usable = channels.filter((c) => !c.is_disconnected);
  const initialChannels = (campaignAsset?.channel_ids?.length ? campaignAsset.channel_ids : channels.filter((c) => c.selected && platformForService(c.service) === asset.platform).map((c) => c.channel_id)).filter((id) =>
    usable.some((c) => c.channel_id === id),
  );
  const [selected, setSelected] = useState<string[]>(initialChannels);
  const [mode, setMode] = useState<PublishMode>(campaignAsset?.scheduled_at ? "customScheduled" : "draft");
  const [local, setLocal] = useState(campaignAsset?.scheduled_at ? utcToZonedLocal(campaignAsset.scheduled_at, timeZone) : "");
  const [ack, setAck] = useState(false);
  const [key, setKey] = useState(newKey);
  const [outcomes, setOutcomes] = useState<ChannelOutcome[] | null>(null);
  // Reference time for the "must be in the future" check; refreshed whenever the dialog opens or advances.
  const [now, setNow] = useState(() => Date.now());
  const publish = useAction(publishContent, { silentSuccess: true });

  const text = publishableText(asset.body, asset.thread_parts);
  const dueAt = mode === "customScheduled" && local ? zonedLocalToUtc(local, timeZone) : null;
  const blocking = openIssues.filter((i) => i.severity === "blocking");
  const unchecked = asset.guardian_status === "unchecked" || asset.guardian_status === "stale";
  const isThread = (asset.thread_parts?.length ?? 0) > 1;

  const channelProblems = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of selected) {
      const ch = channels.find((c) => c.channel_id === id);
      if (!ch) continue;
      const p = platformForService(ch.service);
      if (!p) continue;
      const spec = PLATFORMS[p];
      if (spec.requiresMedia) {
        out[id] = `${spec.label} requires media; ORBIT does not attach media yet.`;
        continue;
      }
      const parts = publishableParts(asset.body, asset.thread_parts, p);
      const tooLong = parts.findIndex((part) => spec.maxChars !== null && countCharacters(part, p) > spec.maxChars);
      if (tooLong >= 0) {
        const count = countCharacters(parts[tooLong], p);
        out[id] = `${parts.length > 1 ? `Thread post ${tooLong + 1} is too long` : "Too long"} for ${spec.label} (${count}/${spec.maxChars}).`;
      }
    }
    return out;
  }, [selected, channels, text]);

  const problems: string[] = [];
  if (!text.trim()) problems.push("The content is empty.");
  if (blocking.length) problems.push(`${blocking.length} blocking Guardian issue(s) must be resolved.`);
  if (unchecked && !ack) problems.push("Guardian hasn't checked this version — run it, or acknowledge below.");
  if (!selected.length) problems.push("Select at least one channel.");
  if (mode === "customScheduled" && (!dueAt || new Date(dueAt).getTime() < now + 60_000)) problems.push("Choose a future date and time.");
  problems.push(...Object.values(channelProblems));

  const reset = () => {
    setStep("configure");
    setOutcomes(null);
    setKey(newKey());
  };

  const submit = async () => {
    const r = await publish.run({
      assetId: asset.id,
      channelIds: selected,
      mode,
      dueAt,
      idempotencyKey: key,
      campaignAssetId: campaignAsset?.id ?? null,
      acknowledgeUnchecked: ack,
      approved: true,
    });
    if (r.ok) {
      setOutcomes(r.data.outcomes);
      setStep("result");
      const okN = r.data.outcomes.filter((o) => o.status === "succeeded").length;
      const total = r.data.outcomes.length;
      if (okN === total) toast.success(r.message ?? "Created in Buffer.");
      else if (okN === 0) toast.error(r.message ?? "Buffer could not create the post.");
      else toast.warning(r.message ?? "Some posts failed.");
      router.refresh();
    }
  };

  if (!connection) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold">Publish via Buffer</h2>
        <p className="mb-3 text-sm text-muted-foreground">Connect Buffer to send this content to your channels.</p>
        <Link href="/publishing" className={buttonVariants({ size: "sm", variant: "outline" })}>
          Connect Buffer
        </Link>
      </section>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setNow(Date.now());
        if (!o && step === "result") reset();
      }}
    >
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Publish via Buffer</h2>
          <span className="text-xs text-muted-foreground">{connection.organizationName}</span>
        </div>
        {connection.status !== "active" ? (
          <Notice tone="warning">Your Buffer connection needs to be renewed. <Link href="/publishing" className="underline">Reconnect</Link></Notice>
        ) : (
          <DialogTrigger render={<Button className="w-full" />}>
            <Send /> Review & send to Buffer
          </DialogTrigger>
        )}
      </section>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {step === "configure" ? (
          <>
            <DialogHeader>
              <DialogTitle>Send to Buffer</DialogTitle>
              <DialogDescription>Nothing is sent until you approve on the next screen.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-medium">Channels</p>
                {usable.length ? (
                  <ul className="space-y-1.5">
                    {usable.map((c) => {
                      const on = selected.includes(c.channel_id);
                      const p = platformForService(c.service);
                      return (
                        <li key={c.channel_id}>
                          <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm", on ? "border-primary/50 bg-primary/5" : "border-border")}>
                            <Checkbox checked={on} onCheckedChange={(v) => setSelected(v ? [...selected, c.channel_id] : selected.filter((x) => x !== c.channel_id))} />
                            <span className="flex-1">
                              {c.display_name ?? c.name}
                              <span className="ml-2 text-xs text-muted-foreground">{p ? PLATFORMS[p].label : c.service}</span>
                            </span>
                            {c.is_locked ? <Pill tone="warning">Locked</Pill> : null}
                            {c.is_queue_paused ? <Pill tone="warning">Queue paused</Pill> : null}
                            {p && p !== asset.platform ? <Pill>Written for {PLATFORMS[asset.platform].label}</Pill> : null}
                          </label>
                          {on && channelProblems[c.channel_id] ? <p className="mt-1 ml-1 text-xs text-destructive">{channelProblems[c.channel_id]}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <Notice tone="warning">No connected channels. <Link href="/publishing" className="underline">Refresh channels</Link></Notice>
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">When</p>
                <div className="grid gap-1.5" role="radiogroup" aria-label="Scheduling">
                  {MODES.map((m) => (
                    <label key={m.id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-2.5", mode === m.id ? "border-primary/50 bg-primary/5" : "border-border")}>
                      <input type="radio" name="mode" className="mt-1 accent-primary" checked={mode === m.id} onChange={() => setMode(m.id)} />
                      <span>
                        <span className="text-sm">{m.label}</span>
                        <span className="block text-xs text-muted-foreground">{m.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {mode === "customScheduled" ? (
                  <div className="mt-2">
                    <Input type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} aria-label="Scheduled date and time" />
                    <p className="mt-1 text-xs text-muted-foreground">Time zone: {timeZone} (change in Settings).</p>
                  </div>
                ) : null}
              </div>
              {unchecked && !blocking.length ? (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} className="mt-0.5" />
                  <span>
                    I understand Guardian {asset.guardian_status === "stale" ? "hasn't checked my latest edits" : "hasn't checked this content"} and want to proceed anyway.
                  </span>
                </label>
              ) : null}
              {problems.length ? (
                <ul className="space-y-1 text-sm text-warning">
                  {problems.map((p, i) => (
                    <li key={i} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {p}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setNow(Date.now());
                  setStep("confirm");
                }}
                disabled={problems.length > 0}
              >
                Review
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "confirm" ? (
          <>
            <DialogHeader>
              <DialogTitle>Final confirmation</DialogTitle>
              <DialogDescription>ORBIT will make a real request to Buffer for each channel below.</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Content</dt>
              <dd>
                {asset.title} · <span className="capitalize">{asset.status.replace("_", " ")}</span>
              </dd>
              <dt className="text-muted-foreground">Guardian</dt>
              <dd className="flex flex-wrap items-center gap-1.5">
                <GuardianPill status={asset.guardian_status} />
                {openIssues.length ? <span className="text-xs text-muted-foreground">{openIssues.length} open (non-blocking)</span> : null}
              </dd>
              <dt className="text-muted-foreground">Channels</dt>
              <dd>{selected.map((id) => channels.find((c) => c.channel_id === id)?.name ?? id).join(", ")}</dd>
              <dt className="text-muted-foreground">Scheduling</dt>
              <dd>
                {MODES.find((m) => m.id === mode)?.label}
                {dueAt ? ` — ${formatDateTime(dueAt, timeZone)}` : ""}
              </dd>
              <dt className="text-muted-foreground">Approval</dt>
              <dd>Your approval on this screen</dd>
            </dl>
            {isThread ? (
              <ol className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border bg-background p-3 text-sm">
                {asset.thread_parts!.map((part, i) => (
                  <li key={i} className="whitespace-pre-wrap">
                    <span className="mr-2 text-xs text-muted-foreground tabular-nums">
                      {i + 1}/{asset.thread_parts!.length}
                    </span>
                    {part}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-3 text-sm whitespace-pre-wrap">{text}</div>
            )}
            {isThread ? (
              <Notice>
                {selected.some((id) => platformForService(channels.find((c) => c.channel_id === id)?.service ?? "") !== "x")
                  ? `X channels receive all ${asset.thread_parts!.length} posts as one thread. Other channels receive only the first post.`
                  : `Buffer receives all ${asset.thread_parts!.length} posts as one X thread.`}
              </Notice>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("configure")} disabled={publish.pending}>
                Back
              </Button>
              <Button onClick={submit} disabled={publish.pending}>
                {publish.pending ? <Loader2 className="animate-spin" /> : <Send />}
                {mode === "draft" ? "Approve & create Buffer draft" : mode === "shareNow" ? "Approve & publish now" : "Approve & schedule"}
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "result" && outcomes ? (
          <>
            <DialogHeader>
              <DialogTitle>Buffer results</DialogTitle>
              <DialogDescription>
                {outcomes.filter((o) => o.status === "succeeded").length} of {outcomes.length} succeeded. Each channel is recorded separately.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-2">
              {outcomes.map((o) => (
                <li key={o.channelId} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    {o.status === "succeeded" ? <CheckCircle2 className="size-4 text-success" /> : o.status === "unknown" ? <HelpCircle className="size-4 text-warning" /> : <CircleX className="size-4 text-destructive" />}
                    <span className="flex-1 font-medium">{o.channelName}</span>
                    <OperationPill status={o.status} />
                  </div>
                  {o.bufferPostId ? <p className="mt-1 font-mono text-xs text-muted-foreground">Buffer post ID: {o.bufferPostId}</p> : null}
                  {o.bufferStatus ? <p className="text-xs text-muted-foreground">Buffer status: {o.bufferStatus}{o.dueAt ? ` · due ${formatDateTime(o.dueAt, timeZone)}` : ""}</p> : null}
                  {o.message ? <p className="mt-1 text-xs text-muted-foreground">{o.message}</p> : null}
                  {o.status === "unknown" ? <p className="mt-1 text-xs text-warning">The outcome is uncertain. Use “Check status” in Publishing before retrying to avoid duplicates.</p> : null}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Link href="/publishing" className={buttonVariants({ variant: "outline" })}>
                Publishing history
              </Link>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
