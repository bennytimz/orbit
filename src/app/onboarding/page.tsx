import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile, requireUser } from "@/lib/auth";
import type { UserInterest } from "@/types/domain";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { supabase, userId } = await requireUser();
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const { data } = await supabase.from("user_interests").select("*").eq("user_id", userId);
  return <OnboardingForm profile={profile} interests={((data as UserInterest[]) ?? []).map((i) => i.topic)} />;
}
