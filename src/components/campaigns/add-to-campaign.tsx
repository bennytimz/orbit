"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { addAssetsToCampaign } from "@/app/actions/campaigns";

export function AddToCampaign({ assetId, campaigns, currentCampaignId }: { assetId: string; campaigns: { id: string; name: string }[]; currentCampaignId: string | null }) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(campaigns.find((c) => c.id !== currentCampaignId)?.id ?? "");
  const add = useAction(addAssetsToCampaign);
  const current = campaigns.find((c) => c.id === currentCampaignId);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <FolderKanban className="size-4 text-muted-foreground" /> Campaign
      </h2>
      {current ? (
        <p className="mb-2 text-sm">
          In <Link href={`/campaigns/${current.id}`} className="text-primary hover:underline">{current.name}</Link>
        </p>
      ) : null}
      {campaigns.length ? (
        <div className="flex gap-2">
          <NativeSelect aria-label="Campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <Button size="sm" variant="outline" disabled={!campaignId || add.pending} onClick={async () => (await add.run(campaignId, [assetId], null)).ok && router.refresh()}>
            {add.pending ? <Loader2 className="animate-spin" /> : null} Add
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No campaigns yet. <Link href="/campaigns" className="text-primary hover:underline">Create one</Link>
        </p>
      )}
    </section>
  );
}
