"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserForAction } from "@/lib/auth";
import { ok, runAction, type ActionResult } from "@/lib/action-result";
import { runGuardian } from "@/engines/guardian/check";
import { overallStatus } from "@/engines/guardian/rules";

export async function runGuardianCheck(assetId: string): Promise<ActionResult<{ status: string; issueCount: number; aiChecked: boolean; aiError: string | null }>> {
  return runAction("Guardian could not complete the check. Your content has not been changed.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const { report, issues } = await runGuardian(supabase, userId, z.string().uuid().parse(assetId));
    revalidatePath("/guardian");
    revalidatePath(`/studio/${assetId}`);
    revalidatePath("/dashboard");
    return ok(
      { status: report.overall_status, issueCount: issues.length, aiChecked: report.ai_checked, aiError: report.ai_error },
      report.overall_status === "pass" ? "Guardian found no open problems." : `Guardian found ${issues.length} item${issues.length === 1 ? "" : "s"} to review.`,
    );
  });
}

export async function setIssueReview(issueId: string, status: "open" | "resolved" | "dismissed"): Promise<ActionResult<{ assetStatus: string }>> {
  return runAction("Could not update the issue.", async () => {
    const { supabase, userId } = await requireUserForAction();
    const s = z.enum(["open", "resolved", "dismissed"]).parse(status);
    const { data: issue, error } = await supabase
      .from("guardian_issues")
      .update({ review_status: s, resolved_at: s === "open" ? null : new Date().toISOString() })
      .eq("id", z.string().uuid().parse(issueId))
      .eq("user_id", userId)
      .select("content_asset_id, guardian_report_id")
      .single();
    if (error) throw error;
    // Recompute the asset's Guardian status from the latest report's remaining open issues.
    const { data: siblings } = await supabase.from("guardian_issues").select("severity, review_status").eq("guardian_report_id", issue.guardian_report_id).eq("user_id", userId);
    const { data: asset } = await supabase.from("content_assets").select("guardian_status").eq("id", issue.content_asset_id).eq("user_id", userId).single();
    let assetStatus = asset?.guardian_status as string;
    if (assetStatus !== "stale") {
      assetStatus = overallStatus((siblings ?? []) as { severity: string; review_status: string }[]);
      await supabase.from("content_assets").update({ guardian_status: assetStatus }).eq("id", issue.content_asset_id).eq("user_id", userId);
    }
    revalidatePath("/guardian");
    revalidatePath(`/studio/${issue.content_asset_id}`);
    return ok({ assetStatus });
  });
}
