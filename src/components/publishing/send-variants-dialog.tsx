"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleX, HelpCircle, Layers, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GuardianPill, Notice, OperationPill, NativeSelect } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { publishVariantsTogether } from "@/app/actions/group-publishing";
import { PLATFORMS, platformForService, publishableText } from "@/engines/studio/platforms";
import { formatDateTime, zonedLocalToUtc } from "@/lib/format";
import type { BufferChannelRow, ContentAsset } from "@/types/domain";
import type { ChannelOutcome } from "@/engines/publisher/publish";
import { cn } from "@/lib/utils";

type Mode = "draft" | "addToQueue" | "customScheduled";
const MODES: { id: Mode; label: string; desc: string }[] = [
  { id: "draft", label: "Save as Buffer drafts", desc: "Creates drafts in Buffer. Nothing is published." },
  { id: "addToQueue", label: "Add to queue", desc: "Each post goes to its channel's next queue slot." },
  { id: "customScheduled", label: "Schedule for a time", desc: "Every post is scheduled for the time you choose." },
];

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface VariantView {
  asset: Pick<ContentAsset, "id" | "title" | "platform" | "body" | "thread_parts" | "guardian_status">;
  blockingIssues: number;
  mediaCount: number;
}

/**
 * Sends the platform variants of one piece of content to Buffer together, as a
 * single Buffer content item (one post per channel). Additive to the
 * per-draft "Review & send" flow, which is unchanged.
 */
export function SendVariantsDialog({ variants, channels, timeZone }: { variants: VariantView[]; channels: BufferChannelRow[]; timeZone: string }) {
  const router = useRouter();
  const usable = channels.filter((c) => !c.is_disconnected && !c.is_locked);
  const defaultChannel = (platform: ContentAsset["platform"]) =>
    usable.find((c) => c.selected && platformForService(c.service) === platform)?.channel_id ?? usable.find((c) => platformForService(c.service) === platform)?.channel_id ?? "";
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"configure" | "confirm" | "result">("configure");
  const [include, setInclude] = useState<Record<string, boolean>>(() => Object.fromEntries(variants.map((v) => [v.asset.id, Boolean(defaultChannel(v.asset.platform))])));
  const [channelFor, setChannelFor] = useState<Record<string, string>>(() => Object.fromEntries(variants.map((v) => [v.asset.id, defaultChannel(v.asset.platform)])));
  const [mode, setMode] = useState<Mode>("draft");
  const [local, setLocal] = useState("");
  const [ack, setAck] = useState(false);
  const [key, setKey] = useState(newKey);
  const [now, setNow] = useState(() => Date.now());
  const [outcomes, setOutcomes] = useState<ChannelOutcome[] | null>(null);
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const send = useAction(publishVariantsTogether, { silentSuccess: true });

  const chosen = variants.filter((v) => include[v.asset.id] && channelFor[v.asset.id]);
  const dueAt = mode === "customScheduled" && local ? zonedLocalToUtc(local, timeZone) : null;
  const anyUnchecked = chosen.some((v) => v.asset.guardian_status === "unchecked" || v.asset.guardian_status === "stale");

  const problems: string[] = [];
  if (chosen.length < 2) problems.push("Choose at least two variants, each with a channel.");
  const picked = chosen.map((v) => channelFor[v.asset.id]);
  if (new Set(picked).size !== picked.length) problems.push("Pick a different channel for each variant (Buffer allows one post per channel).");
  for (const v of chosen) if (v.blockingIssues) problems.push(`${PLATFORMS[v.asset.platform].label}: resolve ${v.blockingIssues} blocking Guardian issue(s) first.`);
  if (anyUnchecked && !ack) problems.push("Guardian hasn't checked every variant's latest version — run it, or acknowledge below.");
  if (mode === "customScheduled" && (!dueAt || new Date(dueAt).getTime() < now + 60_000)) problems.push("Choose a future date and time.");

  const reset = () => {
    setStep("configure");
    setOutcomes(null);
    setContentItemId(null);
    setKey(newKey());
  };

  const submit = async () => {
    const r = await send.run({
      pairs: chosen.map((v) => ({ assetId: v.asset.id, channelId: channelFor[v.asset.id] })),
      mode,
      dueAt,
      idempotencyKey: key,
      acknowledgeUnchecked: ack,
      approved: true,
    });
    if (r.ok) {
      setOutcomes(r.data.outcomes);
      setContentItemId(r.data.contentItemId);
      setStep("result");
      const okN = r.data.outcomes.filter((o) => o.status === "succeeded").length;
      if (okN === r.data.outcomes.length) toast.success(r.message ?? "Created in Buffer.");
      else toast.warning(r.message ?? "Some posts were not confirmed.");
      router.refresh();
    }
  };

  const channelName = (id: string) => {
    const c = channels.find((x) => x.channel_id === id);
    return c ? (c.display_name ?? c.name) : id;
  };

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
        <h2 className="mb-1 text-sm font-semibold">Send variants together</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Send the {variants.map((v) => PLATFORMS[v.asset.platform].label).join(", ")} versions as one Buffer content item, so Buffer groups them. Uses Buffer&apos;s content items API (early preview).
        </p>
        <DialogTrigger render={<Button className="w-full" variant="outline" />}>
          <Layers /> Review variants
        </DialogTrigger>
      </section>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {step === "configure" ? (
          <>
            <DialogHeader>
              <DialogTitle>Send variants together</DialogTitle>
              <DialogDescription>One Buffer content item, one post per channel. Nothing is sent until you approve on the next screen.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <ul className="space-y-2">
                {variants.map((v) => {
                  const on = include[v.asset.id];
                  const matching = usable.filter((c) => platformForService(c.service) === v.asset.platform);
                  return (
                    <li key={v.asset.id} className={cn("rounded-lg border p-2.5 text-sm", on ? "border-primary/50 bg-primary/5" : "border-border")}>
                      <label className="flex cursor-pointer items-center gap-3">
                        <Checkbox checked={on} disabled={!matching.length} onCheckedChange={(x) => setInclude({ ...include, [v.asset.id]: Boolean(x) })} />
                        <span className="flex-1">
                          {PLATFORMS[v.asset.platform].label}
                          <span className="ml-2 text-xs text-muted-foreground">{v.asset.title}</span>
                        </span>
                        <GuardianPill status={v.asset.guardian_status} />
                      </label>
                      {matching.length ? (
                        <NativeSelect
                          className="mt-2"
                          aria-label={`Channel for the ${PLATFORMS[v.asset.platform].label} version`}
                          value={channelFor[v.asset.id]}
                          onChange={(e) => setChannelFor({ ...channelFor, [v.asset.id]: e.target.value })}
                          disabled={!on}
                        >
                          {matching.map((c) => (
                            <option key={c.channel_id} value={c.channel_id}>
                              {c.display_name ?? c.name}
                            </option>
                          ))}
                        </NativeSelect>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">No connected {PLATFORMS[v.asset.platform].label} channel in Buffer.</p>
                      )}
                      {v.mediaCount ? <p className="mt-1 text-xs text-muted-foreground">{v.mediaCount} image{v.mediaCount === 1 ? "" : "s"} attached</p> : null}
                    </li>
                  );
                })}
              </ul>
              <div>
                <p className="mb-2 text-sm font-medium">When</p>
                <div className="grid gap-1.5" role="radiogroup" aria-label="Scheduling">
                  {MODES.map((m) => (
                    <label key={m.id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-2.5", mode === m.id ? "border-primary/50 bg-primary/5" : "border-border")}>
                      <input type="radio" name="group-mode" className="mt-1 accent-primary" checked={mode === m.id} onChange={() => setMode(m.id)} />
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
              {anyUnchecked ? (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={ack} onCheckedChange={(x) => setAck(!!x)} className="mt-0.5" />
                  <span>I understand Guardian hasn&apos;t checked every variant&apos;s latest version and want to proceed anyway.</span>
                </label>
              ) : null}
              {problems.length ? (
                <ul className="space-y-1 text-sm text-warning">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
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
              <DialogDescription>ORBIT will make one real request to Buffer that creates every post below as one content item.</DialogDescription>
            </DialogHeader>
            <ul className="space-y-2">
              {chosen.map((v) => (
                <li key={v.asset.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="mb-1 font-medium">
                    {PLATFORMS[v.asset.platform].label} → {channelName(channelFor[v.asset.id])}
                    {v.mediaCount ? <span className="ml-2 text-xs font-normal text-muted-foreground">+ {v.mediaCount} image{v.mediaCount === 1 ? "" : "s"}</span> : null}
                  </p>
                  <p className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">{publishableText(v.asset.body, v.asset.thread_parts)}</p>
                  {(v.asset.thread_parts?.length ?? 0) > 1 ? <p className="mt-1 text-xs text-muted-foreground">Sent as a {v.asset.thread_parts!.length}-post thread on X.</p> : null}
                </li>
              ))}
            </ul>
            <p className="text-sm">
              Scheduling: {MODES.find((m) => m.id === mode)?.label}
              {dueAt ? ` — ${formatDateTime(dueAt, timeZone)}` : ""}
            </p>
            <Notice>If Buffer rejects any post during validation, none are created. If Buffer reports a problem after creating them, ORBIT marks the posts “unknown” so you can check before retrying.</Notice>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("configure")} disabled={send.pending}>
                Back
              </Button>
              <Button onClick={submit} disabled={send.pending}>
                {send.pending ? <Loader2 className="animate-spin" /> : <Layers />}
                {mode === "draft" ? "Approve & create Buffer drafts" : "Approve & schedule"}
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "result" && outcomes ? (
          <>
            <DialogHeader>
              <DialogTitle>Buffer results</DialogTitle>
              <DialogDescription>
                {outcomes.filter((o) => o.status === "succeeded").length} of {outcomes.length} confirmed.
                {contentItemId ? ` Buffer content item: ${contentItemId}` : ""}
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
                  {o.message ? <p className="mt-1 text-xs text-muted-foreground">{o.message}</p> : null}
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
