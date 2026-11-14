"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { NativeSelect, Notice, Pill } from "@/components/shared";
import { useAction } from "@/hooks/use-action";
import { disconnectBuffer, refreshChannels, selectOrganization, setChannelSelected } from "@/app/actions/publishing";
import { PLATFORMS, platformForService } from "@/engines/studio/platforms";
import { formatDate } from "@/lib/format";
import type { BufferChannelRow, BufferOrganizationSummary } from "@/types/domain";

export function ConnectionPanel({
  connection,
  channels,
  timeZone,
}: {
  connection: {
    authType: "oauth" | "api_key";
    accountEmail: string | null;
    organizationId: string | null;
    organizations: BufferOrganizationSummary[];
    status: string;
    lastError: string | null;
    connectedAt: string;
    scopes: string[];
  };
  channels: BufferChannelRow[];
  timeZone: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const org = useAction(selectOrganization);
  const refresh = useAction(refreshChannels);
  const toggle = useAction(setChannelSelected, { silentSuccess: true });
  const disconnect = useAction(disconnectBuffer);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Buffer</h2>
            {connection.status === "active" ? <Pill tone="success">Connected</Pill> : <Pill tone="warning">Needs renewal</Pill>}
            <Pill>{connection.authType === "oauth" ? "OAuth" : "API key"}</Pill>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {connection.accountEmail ?? "Buffer account"} · connected {formatDate(connection.connectedAt, timeZone)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {connection.status !== "active" && connection.authType === "oauth" ? (
            <a href="/api/buffer/connect" className={buttonVariants({ size: "sm" })}>
              Reconnect
            </a>
          ) : null}
          <Button size="sm" variant="outline" onClick={async () => (await refresh.run()).ok && router.refresh()} disabled={refresh.pending || connection.status !== "active"}>
            {refresh.pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh channels
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            <Unplug /> Disconnect
          </Button>
        </div>
      </div>

      {connection.status !== "active" ? (
        <div className="mt-4">
          <Notice tone="warning" title="Your Buffer connection needs to be renewed">
            {connection.lastError ?? "Buffer rejected the stored credentials."} {connection.authType === "api_key" ? "Disconnect and connect again with a valid API key." : ""}
          </Notice>
        </div>
      ) : null}

      {connection.organizations.length > 1 ? (
        <div className="mt-4 flex items-center gap-2">
          <label htmlFor="org" className="text-sm text-muted-foreground">Organization</label>
          <NativeSelect id="org" className="w-64" value={connection.organizationId ?? ""} disabled={org.pending} onChange={async (e) => (await org.run(e.target.value)).ok && router.refresh()}>
            {connection.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : connection.organizations[0] ? (
        <p className="mt-4 text-sm text-muted-foreground">Organization: {connection.organizations[0].name}</p>
      ) : null}

      <div className="mt-5">
        <h3 className="mb-1 text-sm font-medium">Channels</h3>
        <p className="mb-3 text-xs text-muted-foreground">Enabled channels are pre-selected when you publish matching content.</p>
        {channels.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {channels.map((c) => {
              const p = platformForService(c.service);
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  {c.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatar} alt="" className="size-8 rounded-full" />
                  ) : (
                    <span className="size-8 rounded-full bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.display_name ?? c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p ? PLATFORMS[p].label : c.service}
                      {c.is_disconnected ? " · disconnected in Buffer" : c.is_locked ? " · locked" : c.is_queue_paused ? " · queue paused" : ""}
                      {p && PLATFORMS[p].requiresMedia ? " · needs media" : ""}
                    </p>
                  </div>
                  <Switch checked={c.selected} disabled={toggle.pending} onCheckedChange={async (v) => (await toggle.run(c.channel_id, v)).ok && router.refresh()} aria-label={`Use ${c.name} by default`} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No channels found in this Buffer organization. Connect channels in Buffer, then refresh.</p>
        )}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Buffer?</AlertDialogTitle>
            <AlertDialogDescription>
              ORBIT deletes its stored Buffer credentials and channel list. Posts already in Buffer stay there and are not changed. Your operation history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async () => (await disconnect.run()).ok && router.refresh()}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
