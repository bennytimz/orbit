"use server";

import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { BufferApiError } from "@/lib/buffer/client";
import { BufferNotConnectedError, BufferReauthRequiredError, getAccessToken } from "@/lib/buffer/credentials";
import { buildDiscoveryIdeaContent, createIdea } from "@/lib/buffer/ideas";

const NEEDS_IDEAS_SCOPE = "Buffer did not allow ORBIT to create Ideas. Reconnect Buffer in Publishing to grant Ideas access.";

/**
 * Saves a discovery (title, short summary, source link) to Buffer Ideas via
 * createIdea. The content is read from the database for the signed-in user,
 * never taken from the client. Nothing is recorded unless Buffer returns an
 * idea ID.
 */
export async function saveDiscoveryToBufferIdeas(discoveryId: string): Promise<ActionResult<{ ideaId: string }>> {
  return runAction("Buffer could not save this idea. Please try again.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const id = z.string().uuid().parse(discoveryId);

    const [{ data: discovery }, { data: links }] = await Promise.all([
      supabase.from("discoveries").select("id, title, summary").eq("id", id).eq("user_id", userId).maybeSingle(),
      supabase.from("discovery_sources").select("research_sources(url)").eq("discovery_id", id).eq("user_id", userId),
    ]);
    if (!discovery) return fail("Discovery not found.");
    const sourceUrl =
      ((links ?? []) as unknown as { research_sources: { url: string } | null }[]).map((l) => l.research_sources?.url).find((u): u is string => !!u) ?? null;

    let token: string;
    let organizationId: string | null;
    try {
      const auth = await getAccessToken(userId);
      token = auth.token;
      organizationId = auth.connection.organization_id;
    } catch (error) {
      if (error instanceof BufferNotConnectedError) return fail("Connect Buffer in Publishing first.", "not_connected");
      if (error instanceof BufferReauthRequiredError) return fail("Your Buffer connection needs to be renewed. Reconnect Buffer.", "needs_reauth");
      throw error;
    }
    if (!organizationId) return fail("Select a Buffer organization in Publishing first.", "no_organization");

    let result;
    try {
      result = await createIdea(token, {
        organizationId,
        content: buildDiscoveryIdeaContent({ title: discovery.title as string, summary: (discovery.summary as string) ?? "", sourceUrl }),
      });
    } catch (error) {
      if (error instanceof BufferApiError) {
        if (error.kind === "unauthorized" || error.kind === "forbidden") return fail(NEEDS_IDEAS_SCOPE, "ideas_scope");
        if (error.ambiguous) return fail("Buffer did not confirm the idea. Check Buffer Ideas before trying again so you don't create a duplicate.", "unknown");
        if (error.kind === "rate_limited") return fail(error.message, "rate_limited");
        return fail(`Buffer: ${error.message}`, error.kind);
      }
      throw error;
    }

    if (!result.ok) {
      if (result.errorType === "UnauthorizedError") return fail(`${NEEDS_IDEAS_SCOPE} (${result.message})`, "ideas_scope");
      if (result.errorType === "LimitReachedError") return fail(`Buffer Ideas limit reached: ${result.message}`, "limit_reached");
      return fail(`Buffer could not save this idea: ${result.message}`, result.errorType);
    }

    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "buffer_idea_created",
      resource_type: "discovery",
      resource_id: id,
      metadata: { buffer_idea_id: result.idea.id, organization_id: organizationId },
    });
    return ok({ ideaId: result.idea.id }, `Saved to Buffer Ideas (ID ${result.idea.id}).`);
  });
}
