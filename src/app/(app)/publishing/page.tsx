import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { getConnection } from "@/lib/buffer/credentials";
import { Notice, OperationPill, PageHeader, Pill } from "@/components/shared";
import { ConnectBuffer } from "@/components/publishing/connect-buffer";
import { ConnectionPanel } from "@/components/publishing/connection-panel";
import { BufferPostsBrowser } from "@/components/publishing/buffer-posts";
import { CheckStatusButton } from "@/components/publishing/check-status-button";
import { formatDateTime, titleCase } from "@/lib/format";
import type { BufferChannelRow, BufferPublication } from "@/types/domain";

export const metadata: Metadata = { title: "Publishing" };

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Buffer OAuth is not configured on this server (BUFFER_CLIENT_ID / BUFFER_CLIENT_SECRET / BUFFER_TOKEN_ENCRYPTION_KEY). You can connect with a personal API key instead.",
  invalid_state: "The Buffer sign-in session expired or didn't match. Please try again.",
  denied: "Buffer access was not granted.",
  auth_failed: "Unable to connect to Buffer. Please try again.",
  invalid_grant: "The Buffer authorization code expired or was already used. Please try again.",
};

export default async function PublishingPage({ searchParams }: { searchParams: Promise<{ buffer?: string; buffer_error?: string; warning?: string }> }) {
  const sp = await searchParams;
  const { supabase, userId } = await requireUser();
  const status = integrations();
  const connection = status.serviceRole ? await getConnection(userId).catch(() => null) : null;
  const [{ data: channels }, { data: pubs }, { data: profile }] = await Promise.all([
    supabase.from("buffer_channels").select("*").eq("user_id", userId).order("name"),
    supabase.from("buffer_publications").select("*").eq("user_id", userId).order("attempted_at", { ascending: false }).limit(50),
    supabase.from("profiles").select("timezone").eq("user_id", userId).single(),
  ]);
  const tz = (profile?.timezone as string) ?? "UTC";
  const publications = (pubs ?? []) as BufferPublication[];
  const channelRows = (channels ?? []) as BufferChannelRow[];

  return (
    <div>
      <PageHeader title="Publishing" description="Your Buffer connection, channels, Buffer posts, and every publishing operation ORBIT has attempted." />
      <div className="mb-6 space-y-3">
        {sp.buffer === "connected" ? (
          <Notice tone={sp.warning ? "warning" : "success"} title="Buffer connected">
            {sp.warning === "channels" ? "Connected, but channels could not be retrieved yet. Use Refresh channels." : "Channels have been retrieved from your Buffer organization."}
          </Notice>
        ) : null}
        {sp.buffer_error ? <Notice tone="danger" title="Buffer connection failed">{ERROR_MESSAGES[sp.buffer_error] ?? ERROR_MESSAGES.auth_failed}</Notice> : null}
        {!status.serviceRole ? (
          <Notice tone="warning" title="Server configuration incomplete">SUPABASE_SERVICE_ROLE_KEY is required to store Buffer credentials securely.</Notice>
        ) : null}
        {!status.bufferEncryption ? <Notice tone="warning" title="Token encryption key missing">BUFFER_TOKEN_ENCRYPTION_KEY must be set before connecting Buffer.</Notice> : null}
      </div>

      {connection ? (
        <ConnectionPanel
          connection={{
            authType: connection.auth_type,
            accountEmail: connection.account_email,
            organizationId: connection.organization_id,
            organizations: connection.organizations,
            status: connection.status,
            lastError: connection.last_error,
            connectedAt: connection.connected_at,
            scopes: connection.scopes,
          }}
          channels={channelRows}
          timeZone={tz}
        />
      ) : (
        <ConnectBuffer oauthAvailable={status.bufferOAuth && status.bufferEncryption && status.serviceRole} apiKeyAvailable={status.bufferEncryption && status.serviceRole} />
      )}

      {connection && connection.status === "active" ? (
        <section className="mt-8">
          <h2 className="mb-1 text-base font-semibold">In Buffer</h2>
          <p className="mb-3 text-sm text-muted-foreground">Live data from Buffer for {connection.organization_name}. This is what Buffer actually holds, separate from ORBIT drafts.</p>
          <BufferPostsBrowser channels={channelRows.map((c) => ({ id: c.channel_id, name: c.display_name ?? c.name }))} timeZone={tz} />
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-1 text-base font-semibold">ORBIT operation history</h2>
        <p className="mb-3 text-sm text-muted-foreground">Every request ORBIT sent to Buffer, with the actual recorded result.</p>
        {publications.length ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Content</th>
                  <th className="px-3 py-2 font-medium">Channel</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Buffer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {publications.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatDateTime(p.attempted_at, tz)}</td>
                    <td className="max-w-xs px-3 py-2.5">
                      {p.content_asset_id ? (
                        <Link href={`/studio/${p.content_asset_id}`} className="line-clamp-2 hover:text-primary">
                          {p.text_sent}
                        </Link>
                      ) : (
                        <span className="line-clamp-2">{p.text_sent}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {p.channel_name ?? p.channel_id}
                      {p.channel_service ? <span className="block text-xs text-muted-foreground">{p.channel_service}</span> : null}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {titleCase(p.mode)}
                      {p.due_at ? <span className="block text-xs text-muted-foreground">{formatDateTime(p.due_at, tz)}</span> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <OperationPill status={p.operation_status} />
                      {p.error_message ? <p className="mt-1 max-w-xs text-xs text-destructive">{p.error_message}</p> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {p.buffer_post_id ? <span className="block font-mono text-xs">{p.buffer_post_id}</span> : null}
                      {p.buffer_status ? <Pill className="mt-1">{p.buffer_status}</Pill> : null}
                      {p.operation_status === "unknown" || p.operation_status === "pending" || p.buffer_post_id ? <CheckStatusButton publicationId={p.id} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No publishing operations yet. Send approved content from the Studio editor.</p>
        )}
      </section>
    </div>
  );
}
