"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { fail, ok, runAction, type ActionResult } from "@/lib/action-result";
import { BufferApiError } from "@/lib/buffer/client";
import { BufferNotConnectedError, BufferReauthRequiredError } from "@/lib/buffer/credentials";
import { publishVariantsAsContentItem } from "@/engines/publisher/group";
import type { ChannelOutcome } from "@/engines/publisher/publish";

const GroupInput = z.object({
  pairs: z.array(z.object({ assetId: z.string().uuid(), channelId: z.string().trim().min(1).max(100) })).min(2).max(10),
  mode: z.enum(["draft", "addToQueue", "customScheduled"]),
  dueAt: z.string().datetime({ offset: true }).nullable(),
  idempotencyKey: z.string().min(16).max(100),
  acknowledgeUnchecked: z.boolean(),
  /** Must be literally true: the user clicked the final approval button. */
  approved: z.literal(true),
});

/** Sends platform variants of one piece of content to Buffer as one content item. */
export async function publishVariantsTogether(input: z.input<typeof GroupInput>): Promise<ActionResult<{ outcomes: ChannelOutcome[]; contentItemId: string | null }>> {
  return runAction("Buffer could not create these posts. Review the error and retry.", async () => {
    try {
      const { supabase, userId } = await requireUserForAction();
      const data = GroupInput.parse(input);
      const result = await publishVariantsAsContentItem(supabase, userId, data);
      revalidatePath("/publishing");
      revalidatePath("/studio", "layout");
      revalidatePath("/dashboard");
      if (result.problems.length) return { ok: false, error: result.problems.map((p) => p.message).join(" "), code: "preflight" };
      const okCount = result.outcomes.filter((o) => o.status === "succeeded").length;
      const total = result.outcomes.length;
      const message =
        okCount === total
          ? `${okCount} posts created in Buffer as one content item.`
          : okCount === 0
            ? "Buffer did not confirm the posts. Review the results below and use “Check status” before retrying."
            : `${okCount} of ${total} posts confirmed. Review the others before retrying.`;
      return ok({ outcomes: result.outcomes, contentItemId: result.contentItemId }, message);
    } catch (error) {
      if (error instanceof BufferNotConnectedError) return fail("Connect Buffer first.", "not_connected");
      if (error instanceof BufferReauthRequiredError) return fail("Your Buffer connection needs to be renewed. Reconnect Buffer.", "needs_reauth");
      if (error instanceof BufferApiError) return fail(`Buffer: ${error.message}`, error.kind);
      throw error;
    }
  });
}
