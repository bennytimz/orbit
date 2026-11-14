"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/server";
import { BufferApiError } from "@/lib/buffer/client";
import { BufferNotConnectedError, BufferReauthRequiredError, deleteConnection, getConnection, saveConnection } from "@/lib/buffer/credentials";
import { fetchAccount, fetchPosts, type BufferPost, type BufferPostStatus } from "@/lib/buffer/operations";
import { getAccessToken } from "@/lib/buffer/credentials";
import { publishToBuffer, reconcilePublication, syncChannels, type ChannelOutcome, type PreflightProblem } from "@/engines/publisher/publish";
import type { BufferPublication } from "@/types/domain";

function bufferFailure(error: unknown): ActionResult<never> | null {
  if (error instanceof BufferNotConnectedError) return fail("Connect Buffer first.", "not_connected");
  if (error instanceof BufferReauthRequiredError) return fail("Your Buffer connection needs to be renewed. Reconnect Buffer.", "needs_reauth");
  if (error instanceof BufferApiError) {
    if (error.kind === "rate_limited") return fail(`${error.message}${error.retryAfterSeconds ? ` Retry in about ${Math.ceil(error.retryAfterSeconds / 60)} min.` : ""}`, "rate_limited");
    if (error.kind === "unauthorized") return fail("Your Buffer connection needs to be renewed.", "needs_reauth");
    return fail(`Buffer: ${error.message}`, error.kind);
  }
  return null;
}

async function withBuffer<T>(fallback: string, body: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return runAction(fallback, async () => {
    try {
      return await body();
    } catch (error) {
      const mapped = bufferFailure(error);
      if (mapped) return mapped;
      throw error;
    }
  });
}

/** Connects with a Buffer personal API key (an officially supported alternative to OAuth). */
export async function connectWithApiKey(apiKey: string): Promise<ActionResult> {
  return withBuffer("Unable to connect to Buffer. Please try again.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const key = z.string().trim().min(10, "Paste your Buffer API key.").max(500).parse(apiKey);
    let account;
    try {
      account = await fetchAccount(key);
    } catch (error) {
      if (error instanceof BufferApiError && (error.kind === "unauthorized" || error.kind === "forbidden")) return fail("Buffer rejected that API key.");
      throw error;
    }
    await saveConnection({ userId, authType: "api_key", tokens: { access_token: key, token_type: "Bearer" }, account, organizations: account.organizations });
    await syncChannels(userId);
    await supabase.from("activity_logs").insert({ user_id: userId, action: "buffer_connected", resource_type: "buffer_connection", metadata: { auth_type: "api_key" } });
    revalidatePath("/publishing");
    return ok(undefined, "Buffer connected.");
  });
}

export async function selectOrganization(organizationId: string): Promise<ActionResult> {
  return withBuffer("Could not switch organization.", async () => {
    const { userId } = await requireUserForAction();
    const id = z.string().trim().min(1).max(100).parse(organizationId);
    const connection = await getConnection(userId);
    if (!connection) return fail("Connect Buffer first.");
    const org = connection.organizations.find((o) => o.id === id);
    if (!org) return fail("That organization is not available on this Buffer account.");
    await createAdminClient().from("buffer_connections").update({ organization_id: org.id, organization_name: org.name }).eq("user_id", userId);
    await syncChannels(userId);
    revalidatePath("/publishing");
    return ok(undefined, `Switched to ${org.name}.`);
  });
}

export async function refreshChannels(): Promise<ActionResult<{ count: number }>> {
  return withBuffer("Could not refresh channels from Buffer.", async () => {
    const { userId } = await requireUserForAction();
    const channels = await syncChannels(userId);
    revalidatePath("/publishing");
    return ok({ count: channels.length }, `Found ${channels.length} channel${channels.length === 1 ? "" : "s"} in Buffer.`);
  });
}

export async function setChannelSelected(channelId: string, selected: boolean): Promise<ActionResult> {
  return runAction("Could not update the channel.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { error } = await supabase.from("buffer_channels").update({ selected: z.boolean().parse(selected) }).eq("channel_id", z.string().min(1).max(100).parse(channelId)).eq("user_id", userId);
    if (error) throw error;
    revalidatePath("/publishing");
    return ok(undefined);
  });
}

export async function disconnectBuffer(): Promise<ActionResult> {
  return runAction("Could not disconnect Buffer.", async () => {
    const { supabase, userId } = await requireUserForAction();
    await deleteConnection(userId);
    await supabase.from("activity_logs").insert({ user_id: userId, action: "buffer_disconnected", resource_type: "buffer_connection" });
    revalidatePath("/publishing");
    return ok(undefined, "Buffer disconnected. Stored credentials were deleted. Posts already in Buffer are unaffected; you can also revoke ORBIT in Buffer's settings.");
  });
}

const PublishInput = z.object({
  assetId: z.string().uuid(),
  channelIds: z.array(z.string().trim().min(1).max(100)).min(1, "Select at least one channel.").max(10),
  mode: z.enum(["draft", "addToQueue", "customScheduled", "shareNext", "shareNow"]),
  dueAt: z.string().datetime({ offset: true }).nullable(),
  idempotencyKey: z.string().min(16).max(100),
  campaignAssetId: z.string().uuid().nullable(),
  acknowledgeUnchecked: z.boolean(),
  /** Must be literally true: the user clicked the final approval button. */
  approved: z.literal(true),
});

export async function publishContent(input: z.input<typeof PublishInput>): Promise<ActionResult<{ outcomes: ChannelOutcome[]; problems: PreflightProblem[] }>> {
  return withBuffer("Buffer could not create this post. Review the error and retry.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const data = PublishInput.parse(input);
    const result = await publishToBuffer(supabase, userId, data);
    revalidatePath("/publishing");
    revalidatePath(`/studio/${data.assetId}`);
    revalidatePath("/dashboard");
    if (data.campaignAssetId) revalidatePath("/campaigns", "layout");
    if (result.problems.length) return { ok: false, error: result.problems.map((p) => p.message).join(" "), code: "preflight" };
    const okCount = result.outcomes.filter((o) => o.status === "succeeded").length;
    const total = result.outcomes.length;
    const message =
      okCount === total
        ? `${okCount} post${okCount === 1 ? "" : "s"} created in Buffer.`
        : okCount === 0
          ? "Buffer could not create the post. Review the errors below."
          : `${okCount} post${okCount === 1 ? " was" : "s were"} created successfully. ${total - okCount} did not succeed.`;
    return ok(result, message);
  });
}

export async function checkPublicationStatus(publicationId: string): Promise<ActionResult<BufferPublication>> {
  return withBuffer("Could not check the status in Buffer.", async () => {
    const { userId } = await requireUserForAction();
    const pub = await reconcilePublication(userId, z.string().uuid().parse(publicationId));
    revalidatePath("/publishing");
    return ok(pub, pub.operation_status === "succeeded" ? "Confirmed: the post exists in Buffer." : pub.operation_status === "failed" ? "Not found in Buffer — safe to retry." : "Status unchanged.");
  });
}

export async function listBufferPosts(status: BufferPostStatus[], after?: string): Promise<ActionResult<{ posts: BufferPost[]; hasNextPage: boolean; endCursor: string | null }>> {
  return withBuffer("Could not load posts from Buffer.", async () => {
    const { userId } = await requireUserForAction();
    const { token, connection } = await getAccessToken(userId);
    if (!connection.organization_id) return fail("Select a Buffer organization first.");
    const statuses = z.array(z.enum(["draft", "error", "needs_approval", "scheduled", "sending", "sent"])).min(1).parse(status);
    const res = await fetchPosts(token, { organizationId: connection.organization_id, statuses, first: 20, after, sortDueAtAsc: statuses.includes("scheduled") });
    return ok(res);
  });
}
