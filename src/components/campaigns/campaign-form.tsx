"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { saveCampaign } from "@/app/actions/campaigns";
import { DEFAULT_PHASES, OBJECTIVE_LABELS } from "@/engines/campaign/phases";
import type { Campaign, CampaignObjective, CampaignPhase } from "@/types/domain";

export function CampaignForm({ campaign }: { campaign?: Campaign }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(campaign?.name ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [objective, setObjective] = useState<CampaignObjective>(campaign?.objective ?? "thought_leadership");
  const [audience, setAudience] = useState(campaign?.target_audience ?? "");
  const [status, setStatus] = useState<Campaign["status"]>(campaign?.status ?? "planning");
  const [start, setStart] = useState(campaign?.start_date ?? "");
  const [end, setEnd] = useState(campaign?.end_date ?? "");
  const [phases, setPhases] = useState<CampaignPhase[]>(campaign?.phases ?? DEFAULT_PHASES.thought_leadership);
  const [phasesTouched, setPhasesTouched] = useState(!!campaign);
  const save = useAction(saveCampaign);

  const submit = async () => {
    const r = await save.run(
      {
        name,
        description: description || null,
        objective,
        target_audience: audience || null,
        status,
        phases: phases.filter((p) => p.name.trim()).map((p, i) => ({ ...p, key: p.key || `phase-${i + 1}` })),
        start_date: start || null,
        end_date: end || null,
      },
      campaign?.id,
    );
    if (r.ok) {
      setOpen(false);
      if (campaign) router.refresh();
      else router.push(`/campaigns/${r.data.id}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={campaign ? "outline" : "default"} size={campaign ? "sm" : "default"} />}>
        {campaign ? <Pencil /> : <Plus />} {campaign ? "Edit" : "New campaign"}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{campaign ? "Edit campaign" : "New campaign"}</DialogTitle>
          <DialogDescription>Phases are a starting point — rename, add or remove them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name" htmlFor="c-name">
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Objective" htmlFor="c-objective">
              <NativeSelect
                id="c-objective"
                value={objective}
                onChange={(e) => {
                  const o = e.target.value as CampaignObjective;
                  setObjective(o);
                  if (!phasesTouched) setPhases(DEFAULT_PHASES[o]);
                }}
              >
                {Object.entries(OBJECTIVE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Status" htmlFor="c-status">
              <NativeSelect id="c-status" value={status} onChange={(e) => setStatus(e.target.value as Campaign["status"])}>
                {["planning", "active", "paused", "completed", "archived"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Description" htmlFor="c-desc">
            <Textarea id="c-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} />
          </Field>
          <Field label="Target audience" htmlFor="c-aud">
            <Input id="c-aud" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={500} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="c-start">
              <Input id="c-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="End date" htmlFor="c-end">
              <Input id="c-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <Field label="Phases">
            <ul className="space-y-2">
              {phases.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <Input
                    value={p.name}
                    aria-label={`Phase ${i + 1} name`}
                    onChange={(e) => {
                      setPhasesTouched(true);
                      setPhases(phases.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)));
                    }}
                    className="w-40"
                    maxLength={80}
                  />
                  <Input
                    value={p.description}
                    aria-label={`Phase ${i + 1} description`}
                    onChange={(e) => {
                      setPhasesTouched(true);
                      setPhases(phases.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)));
                    }}
                    maxLength={300}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove phase ${p.name}`}
                    onClick={() => {
                      setPhasesTouched(true);
                      setPhases(phases.filter((_, j) => j !== i));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            {phases.length < 10 ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => {
                  setPhasesTouched(true);
                  setPhases([...phases, { key: `phase-${Date.now()}`, name: "", description: "" }]);
                }}
              >
                <Plus /> Add phase
              </Button>
            ) : null}
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!name.trim() || save.pending}>
            {save.pending ? <Loader2 className="animate-spin" /> : null} {campaign ? "Save" : "Create campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
