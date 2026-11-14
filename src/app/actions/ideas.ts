"use server";

import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { BufferApiError } from "@/lib/buffer/client";
import { BufferNotConnectedError, BufferReauthRequiredError, getAccessToken } from "@/lib/buffer/credentials";
import { IDEA_LOG_ACTION, buildDiscoveryIdeaContent, createIdea, saveIdeaOnce } from "@/lib/buffer/ideas";
import { findSavedIdeaIds } from "@/lib/buffer/idea-log";

const NEEDS_IDEAS_SCOPE = "Buffer did not allow ORBIT to create Ideas. Reconnect Buffer in Publishing to grant Ideas access.";

class ActionStop extends Error {
  constructor(public readonly result: ActionResult<never>) {
    super(result.ok ? "" : result.error);
  }
}

/**
 * Saves a discovery (title, short summary, source link) to Buffer Ideas via
 * createIdea. The content is read from the database for the signed-in user,
 * never taken from the client. Nothing is recorded unless Buffer returns an
 * idea ID, and an item with a recorded Idea ID is never sent again.
 */
export async function saveDiscoveryToBufferIdeas(discoveryId: string): Promise<ActionResult<{ ideaId: string; alreadySaved: boolean }>> {
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

    let organizationId: string | null = null;
    let outcome;
    try {
      outcome = await saveIdeaOnce({
        findRecordedIdeaId: async () => (await findSavedIdeaIds(supabase, userId, [id]))[id] ?? null,
        create: async () => {
          let token: string;
          try {
            const auth = await getAccessToken(userId);
            token = auth.token;
            organizationId = auth.connection.organization_id;
          } catch (error) {
            if (error instanceof BufferNotConnectedError) throw new ActionStop(fail("Connect Buffer in Publishing first.", "not_connected"));
            if (error instanceof BufferReauthRequiredError) throw new ActionStop(fail("Your Buffer connection needs to be renewed. Reconnect Buffer.", "needs_reauth"));
            throw error;
          }
          if (!organizationId) throw new ActionStop(fail("Select a Buffer organization in Publishing first.", "no_organization"));
          return createIdea(token, {
            organizationId,
            content: buildDiscoveryIdeaContent({ title: discovery.title as string, summary: (discovery.summary as string) ?? "", sourceUrl }),
          });
        },
        record: async (ideaId) => {
          const { error } = await supabase.from("activity_logs").insert({
            user_id: userId,
            action: IDEA_LOG_ACTION,
            resource_type: "discovery",
            resource_id: id,
            metadata: { buffer_idea_id: ideaId, organization_id: organizationId },
          });
          if (error) console.error("[orbit] Buffer Idea created but not recorded", ideaId, error.message);
        },
      });
    } catch (error) {
      if (error instanceof ActionStop) return error.result;
      if (error instanceof BufferApiError) {
        if (error.kind === "unauthorized" || error.kind === "forbidden") return fail(NEEDS_IDEAS_SCOPE, "ideas_scope");
        if (error.ambiguous) return fail("Buffer did not confirm the idea. Check Buffer Ideas before trying again so you don't create a duplicate.", "unknown");
        if (error.kind === "rate_limited") return fail(error.message, "rate_limited");
        return fail(`Buffer: ${error.message}`, error.kind);
      }
      throw error;
    }

    if (outcome.status === "already_saved") return fail(`Already saved to Buffer Ideas (ID ${outcome.ideaId}).`, "already_saved");
    if (outcome.status === "failed") {
      if (outcome.errorType === "UnauthorizedError") return fail(`${NEEDS_IDEAS_SCOPE} (${outcome.message})`, "ideas_scope");
      if (outcome.errorType === "LimitReachedError") return fail(`Buffer Ideas limit reached: ${outcome.message}`, "limit_reached");
      return fail(`Buffer could not save this idea: ${outcome.message}`, outcome.errorType);
    }
    return ok({ ideaId: outcome.ideaId, alreadySaved: false }, `Saved to Buffer Ideas (ID ${outcome.ideaId}).`);
  });
}
