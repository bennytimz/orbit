"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { addAssetsToCampaign } from "@/app/actions/campaigns";
import { PLATFORMS } from "@/engines/studio/platforms";
import type { CampaignPhase, ContentAsset } from "@/types/domain";

export function AddExistingContent({ campaignId, phases, assets }: { campaignId: string; phases: CampaignPhase[]; assets: Pick<ContentAsset, "id" | "title" | "platform" | "status">[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [phase, setPhase] = useState(phases[0]?.key ?? "");
  const add = useAction(addAssetsToCampaign);

  return (
    <section className="rounded-xl border border-border p-4">
      <h2 className="mb-1 text-sm font-semibold">Add existing content</h2>
      <p className="mb-3 text-xs text-muted-foreground">Drafts not yet in a campaign.</p>
      {assets.length ? (
        <>
          <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto">
            {assets.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                  <Checkbox checked={selected.includes(a.id)} onCheckedChange={(v) => setSelected(v ? [...selected, a.id] : selected.filter((x) => x !== a.id))} />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{PLATFORMS[a.platform].label}</span>
                  <span className="flex-1 truncate">{a.title}</span>
                  <span className="text-xs text-muted-foreground">{a.status}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            {phases.length ? (
              <NativeSelect aria-label="Phase" className="w-48" value={phase} onChange={(e) => setPhase(e.target.value)}>
                {phases.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
            <Button
              size="sm"
              disabled={!selected.length || add.pending}
              onClick={async () => {
                const r = await add.run(campaignId, selected, phase || null);
                if (r.ok) {
                  setSelected([]);
                  router.refresh();
                }
              }}
            >
              {add.pending ? <Loader2 className="animate-spin" /> : null} Add {selected.length || ""} to campaign
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No unassigned drafts. Generate content for this campaign instead.</p>
      )}
    </section>
  );
}
