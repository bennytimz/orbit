"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ExternalLink, History, Loader2, Plus, RotateCcw, Save, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { NativeSelect, Notice } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { acceptRewrite, deleteDraft, restoreVersion, saveDraft, setContentStatus, suggestRewrite } from "@/app/actions/studio";
import { GENERATABLE_PLATFORMS, PLATFORMS, countCharacters } from "@/engines/studio/platforms";
import { formatDateTime, formatDate, hostname } from "@/lib/format";
import type { ContentAsset, ContentVersion, Platform, ResearchSource } from "@/types/domain";
import { cn } from "@/lib/utils";

type Suggestion = { body: string; thread_parts: string[]; change_summary: string; platform: Platform; label: string };

const TRANSFORM_MENU: { kind: "shorten" | "expand" | "more_formal" | "more_casual" | "more_direct" | "clearer_hook" | "fit_limit"; label: string }[] = [
  { kind: "shorten", label: "Shorten" },
  { kind: "expand", label: "Expand (sources only)" },
  { kind: "clearer_hook", label: "Sharper opening" },
  { kind: "more_direct", label: "More direct" },
  { kind: "more_formal", label: "More formal" },
  { kind: "more_casual", label: "More conversational" },
  { kind: "fit_limit", label: "Fit platform limit" },
];

function CharCount({ text, platform }: { text: string; platform: Platform }) {
  const spec = PLATFORMS[platform];
  const n = countCharacters(text, platform);
  const over = spec.maxChars !== null && n > spec.maxChars;
  const near = spec.maxChars !== null && !over && n > spec.maxChars * 0.9;
  return (
    <span className={cn("font-mono text-xs tabular-nums", over ? "text-destructive" : near ? "text-warning" : "text-muted-foreground")} aria-live="polite">
      {n}
      {spec.maxChars ? ` / ${spec.maxChars}` : ""}
      {spec.counting === "x_weighted" ? " (links = 23)" : ""}
    </span>
  );
}

export function ContentEditor({
  asset,
  versions,
  sources,
  timeZone,
  aiAvailable,
}: {
  asset: ContentAsset;
  versions: ContentVersion[];
  sources: { source: Pick<ResearchSource, "id" | "url" | "title" | "publisher" | "published_at">; claims: string[] }[];
  timeZone: string;
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(asset.title);
  const [body, setBody] = useState(asset.body);
  const [parts, setParts] = useState<string[] | null>(asset.thread_parts && asset.thread_parts.length > 1 ? asset.thread_parts : null);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(asset.updated_at);
  const [saved, setSaved] = useState({ title: asset.title, body: asset.body, parts: JSON.stringify(asset.thread_parts ?? null) });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [custom, setCustom] = useState("");
  const [adaptTo, setAdaptTo] = useState<Platform>(asset.platform === "linkedin" ? "x" : "linkedin");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saving = useRef(false);

  const save = useAction(saveDraft, { silentSuccess: true });
  const saveRun = save.run;
  const rewrite = useAction(suggestRewrite, { silentSuccess: true });
  const accept = useAction(acceptRewrite);
  const restore = useAction(restoreVersion);
  const status = useAction(setContentStatus);
  const del = useAction(deleteDraft);

  const effectiveBody = parts ? parts.join("\n\n") : body;
  const dirty = title !== saved.title || effectiveBody !== saved.body || JSON.stringify(parts) !== saved.parts;

  const doSave = useCallback(
    async (kind: "autosave" | "manual") => {
      if (saving.current) return;
      saving.current = true;
      setSaveState("saving");
      const snapshot = { title, body: effectiveBody, parts: JSON.stringify(parts) };
      const r = await saveRun({ id: asset.id, title: title.trim() || "Untitled", body: effectiveBody, threadParts: parts, baseUpdatedAt, kind });
      saving.current = false;
      if (r.ok) {
        setBaseUpdatedAt(r.data.updatedAt);
        setSaved(snapshot);
        setSaveState("saved");
        if (kind === "manual") router.refresh();
      } else setSaveState("error");
    },
    [asset.id, title, effectiveBody, parts, baseUpdatedAt, saveRun, router],
  );

  // Autosave 2.5s after the last change.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => doSave("autosave"), 2500);
    return () => clearTimeout(t);
  }, [dirty, title, effectiveBody, doSave]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        doSave("manual");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSave]);

  const requestRewrite = async (kind: Parameters<typeof suggestRewrite>[0]["kind"], label: string, extra: { targetPlatform?: Platform; customInstruction?: string } = {}) => {
    if (dirty) await doSave("autosave");
    const r = await rewrite.run({ id: asset.id, kind, ...extra });
    if (r.ok) setSuggestion({ ...r.data, label });
  };

  const applySuggestion = async () => {
    if (!suggestion) return;
    if (suggestion.platform !== asset.platform) return; // adapt suggestions are copied, not applied in place
    const r = await accept.run({ id: asset.id, body: suggestion.body, threadParts: suggestion.thread_parts, note: suggestion.label + ": " + suggestion.change_summary, currentBody: effectiveBody });
    if (r.ok) {
      setBody(suggestion.body);
      setParts(suggestion.thread_parts.length > 1 ? suggestion.thread_parts : null);
      setSaved({ title, body: suggestion.thread_parts.length > 1 ? suggestion.thread_parts.join("\n\n") : suggestion.body, parts: JSON.stringify(suggestion.thread_parts.length > 1 ? suggestion.thread_parts : null) });
      setBaseUpdatedAt(r.data.updatedAt);
      setSuggestion(null);
      router.refresh();
    }
  };

  const spec = PLATFORMS[asset.platform];
  const notes = asset.generation_notes;

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" className="h-8 max-w-md flex-1 border-transparent bg-transparent text-sm font-medium dark:bg-transparent" maxLength={200} />
          <span className="text-xs text-muted-foreground" role="status">
            {saveState === "saving" ? "Saving…" : dirty ? "Unsaved changes" : saveState === "error" ? "Save failed" : "All changes saved"}
          </span>
          <div className="ml-auto flex gap-1 rounded-lg bg-muted p-0.5">
            {(["edit", "preview"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={cn("rounded-md px-2.5 py-1 text-xs capitalize", tab === t ? "bg-background" : "text-muted-foreground")}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === "edit" ? (
          <div className="p-3">
            {parts ? (
              <div className="space-y-2">
                {parts.map((p, i) => (
                  <div key={i} className="rounded-lg border border-border p-2">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Post {i + 1}</span>
                      <div className="flex items-center gap-2">
                        <CharCount text={p} platform={asset.platform} />
                        <Button variant="ghost" size="icon-xs" aria-label={`Remove post ${i + 1}`} onClick={() => setParts(parts.length <= 2 ? null : parts.filter((_, j) => j !== i))}>
                          <X />
                        </Button>
                      </div>
                    </div>
                    <Textarea value={p} onChange={(e) => setParts(parts.map((x, j) => (j === i ? e.target.value : x)))} rows={3} className="border-0 bg-transparent p-1 dark:bg-transparent" aria-label={`Thread post ${i + 1}`} />
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setParts([...parts, ""])}>
                  <Plus /> Add post
                </Button>
              </div>
            ) : (
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                aria-label="Content"
                placeholder={`Write your ${spec.label} post…`}
                className="min-h-72 resize-y border-0 bg-transparent text-[15px] leading-relaxed dark:bg-transparent"
              />
            )}
          </div>
        ) : (
          <div className="p-5">
            <div className="mx-auto max-w-xl rounded-xl border border-border bg-background p-4">
              <p className="mb-2 text-xs text-muted-foreground">{spec.label} preview (approximate)</p>
              {(parts ?? [body]).map((p, i) => (
                <p key={i} className={cn("text-[15px] leading-relaxed whitespace-pre-wrap", i > 0 && "mt-3 border-t border-border pt-3")}>
                  {p || <span className="text-muted-foreground">Nothing to preview yet.</span>}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
          {!parts ? <CharCount text={body} platform={asset.platform} /> : <span className="text-xs text-muted-foreground">{parts.length}-post thread</span>}
          {asset.platform === "x" && !parts ? (
            <Button variant="ghost" size="xs" onClick={() => setParts([body, ""])}>
              Make thread
            </Button>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={!aiAvailable || rewrite.pending} />}>
                {rewrite.pending ? <Loader2 className="animate-spin" /> : <Wand2 />} AI rewrite <ChevronDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {TRANSFORM_MENU.map((t) => (
                  <DropdownMenuItem key={t.kind} onClick={() => requestRewrite(t.kind, t.label)}>
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => doSave("manual")} disabled={save.pending}>
              {save.pending ? <Loader2 className="animate-spin" /> : <Save />} Save version
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center">
        <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom AI instruction, e.g. “Lead with the cost implication”" aria-label="Custom instruction" maxLength={1000} disabled={!aiAvailable} />
        <Button variant="outline" size="sm" className="shrink-0" disabled={!custom.trim() || !aiAvailable || rewrite.pending} onClick={() => requestRewrite("custom", "Custom", { customInstruction: custom })}>
          <Sparkles /> Suggest
        </Button>
        <div className="flex shrink-0 items-center gap-1.5">
          <NativeSelect aria-label="Adapt to platform" value={adaptTo} onChange={(e) => setAdaptTo(e.target.value as Platform)} className="w-32">
            {GENERATABLE_PLATFORMS.filter((p) => p !== asset.platform).map((p) => (
              <option key={p} value={p}>
                {PLATFORMS[p].label}
              </option>
            ))}
          </NativeSelect>
          <Button variant="outline" size="sm" disabled={!aiAvailable || rewrite.pending} onClick={() => requestRewrite("adapt", `Adapt for ${PLATFORMS[adaptTo].label}`, { targetPlatform: adaptTo })}>
            Adapt
          </Button>
        </div>
      </div>

      {suggestion ? (
        <section className="rounded-xl border border-primary/40 bg-primary/5 p-4" aria-label="AI suggestion">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Suggestion: {suggestion.label}</p>
              <p className="text-xs text-muted-foreground">{suggestion.change_summary}</p>
            </div>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
                <X /> Discard
              </Button>
              {suggestion.platform === asset.platform ? (
                <Button size="sm" onClick={applySuggestion} disabled={accept.pending}>
                  {accept.pending ? <Loader2 className="animate-spin" /> : <Check />} Apply (current text is versioned)
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(suggestion.body)}>
                  Copy {PLATFORMS[suggestion.platform].label} version
                </Button>
              )}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Current</p>
              <p className="max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-3 text-sm whitespace-pre-wrap">{effectiveBody}</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                Suggested · <CharCount text={suggestion.thread_parts[0] ?? suggestion.body} platform={suggestion.platform} />
              </p>
              <p className="max-h-80 overflow-y-auto rounded-lg border border-primary/30 bg-background p-3 text-sm whitespace-pre-wrap">{suggestion.body}</p>
            </div>
          </div>
        </section>
      ) : null}

      {notes ? (
        <section className="rounded-xl border border-border p-4">
          <h3 className="mb-2 text-sm font-medium">How this draft was generated</h3>
          {notes.perspective_used.length ? (
            <div className="mb-3">
              <p className="mb-1 text-xs text-muted-foreground">Your perspective used</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {notes.perspective_used.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mb-3 text-xs text-muted-foreground">No user perspective was available for this draft.</p>
          )}
          {notes.notes ? <Notice tone="warning" title="Check before publishing">{notes.notes}</Notice> : null}
          {asset.visual_brief ? (
            <div className="mt-3 rounded-lg border border-dashed border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">Visual concept (design brief — no image has been generated)</p>
              <p className="mt-1 text-sm">{asset.visual_brief}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-xl border border-border p-4">
        <h3 className="mb-2 text-sm font-medium">Sources ({sources.length})</h3>
        {sources.length ? (
          <ul className="space-y-2">
            {sources.map(({ source, claims }) => (
              <li key={source.id} className="text-sm">
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium hover:text-primary">
                  {source.title ?? source.url} <ExternalLink className="size-3 opacity-60" />
                </a>
                <p className="text-xs text-muted-foreground">
                  {source.publisher ?? hostname(source.url)} · {source.published_at ? formatDate(source.published_at, timeZone) : "date unknown"}
                </p>
                {claims.length ? (
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                    {claims.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No sources attached. Factual claims in this draft are not traceable.</p>
        )}
      </section>

      <section className="rounded-xl border border-border p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <History className="size-4" /> Version history
        </h3>
        {versions.length ? (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                <span className="w-8 font-mono text-xs text-muted-foreground">v{v.version_number}</span>
                <span className="flex-1 truncate">
                  {v.change_type.replace(/_/g, " ")}
                  {v.note ? <span className="text-muted-foreground"> — {v.note}</span> : null}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{formatDateTime(v.created_at, timeZone)}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={restore.pending || v.body === effectiveBody}
                  onClick={async () => {
                    const r = await restore.run(asset.id, v.id);
                    if (r.ok) {
                      setBody(r.data.body);
                      setParts(r.data.threadParts && r.data.threadParts.length > 1 ? r.data.threadParts : null);
                      setSaved({ title, body: r.data.body, parts: JSON.stringify(r.data.threadParts && r.data.threadParts.length > 1 ? r.data.threadParts : null) });
                      setBaseUpdatedAt(r.data.updatedAt);
                      router.refresh();
                    }
                  }}
                >
                  <RotateCcw /> Restore
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Versions appear when you save, apply an AI rewrite, or restore.</p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={status.pending} onClick={async () => (await status.run(asset.id, "approved")).ok && router.refresh()}>
          <Check /> Mark approved
        </Button>
        <Button variant="ghost" size="sm" disabled={status.pending} onClick={async () => (await status.run(asset.id, "rejected")).ok && router.refresh()}>
          Reject draft
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
            More <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={async () => (await status.run(asset.id, "in_review")).ok && router.refresh()}>Mark in review</DropdownMenuItem>
            <DropdownMenuItem onClick={async () => (await status.run(asset.id, "draft")).ok && router.refresh()}>Back to draft</DropdownMenuItem>
            <DropdownMenuItem onClick={async () => (await status.run(asset.id, "archived")).ok && router.refresh()}>Archive</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete draft
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the draft and its version history in ORBIT. Posts already sent to Buffer are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const r = await del.run(asset.id);
                if (r.ok) router.push("/studio");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
