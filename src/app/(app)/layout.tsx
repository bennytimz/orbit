import { redirect } from "next/navigation";
import { getProfile, requireUser } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const profile = await getProfile();
  if (profile && !profile.onboarding_completed_at) redirect("/onboarding");
  return (
    <AppShell name={profile?.full_name ?? null} email={session.email}>
      {children}
    </AppShell>
  );
}
