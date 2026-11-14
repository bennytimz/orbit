"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, Pill } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { deleteKnowledge, saveKnowledge } from "@/app/actions/brain";
import type { KnowledgeCategory, KnowledgeEntry } from "@/types/domain";
import { Section } from "./profile-section";

const CATEGORIES: KnowledgeCategory[] = ["expertise", "experience", "opinion", "observation", "project", "fact", "preference", "topic"];

export function KnowledgeSection({ entries, title = "Knowledge & opinions", description = "Confirmed facts about you that Studio may draw on. Only what you save here (or explicitly remember) is used." }: { entries: KnowledgeEntry[]; title?: string; description?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "experience" as KnowledgeCategory });
  const save = useAction(saveKnowledge);
  const del = useAction(deleteKnowledge);

  const reset = () => {
    setEditing(null);
    setForm({ title: "", content: "", category: "experience" });
  };

  return (
    <Section title={title} description={description}>
      <form
        className="space-y-2 rounded-lg border border-border p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await save.run({ ...form, source_type: "manual" }, editing ?? undefined);
          if (r.ok) {
            reset();
            router.refresh();
          }
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title, e.g. “Scaled infra team from 3 to 40”" aria-label="Title" maxLength={200} />
          <NativeSelect aria-label="Category" className="sm:w-40" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as KnowledgeCategory })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={3} placeholder="Details in your own words" aria-label="Content" maxLength={5000} />
        <div className="flex justify-end gap-2">
          {editing ? (
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              <X /> Cancel
            </Button>
          ) : null}
          <Button type="submit" size="sm" variant="outline" disabled={!form.title.trim() || !form.content.trim() || save.pending}>
            {save.pending ? <Loader2 className="animate-spin" /> : null} {editing ? "Update" : "Save to memory"}
          </Button>
        </div>
      </form>
      {entries.length ? (
        <ul className="mt-4 space-y-2">
          {entries.map((k) => (
            <li key={k.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{k.title}</span>
                    <Pill>{k.category}</Pill>
                    <Pill tone={k.approved_by_user ? "success" : "warning"}>{k.approved_by_user ? "Confirmed by you" : "Unconfirmed"}</Pill>
                    <span className="text-xs text-muted-foreground">from {k.source_type.replace("_", " ")}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{k.content}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit"
                  onClick={() => {
                    setEditing(k.id);
                    setForm({ title: k.title, content: k.content, category: k.category });
                  }}
                >
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Delete" disabled={del.pending} onClick={async () => (await del.run(k.id)).ok && router.refresh()}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nothing saved yet. You can also click “Remember” on a perspective response.</p>
      )}
    </Section>
  );
}
