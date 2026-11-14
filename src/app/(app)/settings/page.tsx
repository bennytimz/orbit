import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { integrations } from "@/lib/env";
import { PageHeader } from "@/components/shared";
import { Section } from "@/components/voice/profile-section";
import { DeleteAccount } from "@/components/settings/delete-account";

export const metadata: Metadata = { title: "Settings" };

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 text-success" /> : <CircleSlash className="mt-0.5 size-4 text-muted-foreground" />}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

export default async function SettingsPage() {
  const { email } = await requireUser();
  const s = integrations();

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Account, integrations and privacy." />
      <div className="space-y-8">
        <Section title="Account">
          <p className="text-sm">
            Signed in as <span className="font-medium">{email}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Profile, interests, time zone and voice are edited in <Link href="/voice" className="text-primary hover:underline">My Voice</Link>. Buffer is managed in{" "}
            <Link href="/publishing" className="text-primary hover:underline">Publishing</Link>.
          </p>
        </Section>

        <Section title="Integrations" description="Server-side configuration. Secrets are never sent to your browser.">
          <ul className="divide-y divide-border">
            <Status ok={s.ai} label={`AI — ${s.aiProvider}${s.ai ? ` (${s.aiModel})` : ""}`} detail={s.ai ? "Research analysis, drafting, Guardian review and voice analysis. Free-tier quotas apply." : "GEMINI_API_KEY not set: AI features are disabled; rule-based Guardian checks still run."} />
            <Status ok={s.ai} label="Research — submitted URLs and RSS feeds" detail={`Sources are fetched directly, respecting robots.txt, then analyzed by the AI provider.${s.webSearch ? "" : " Web search discovery is not available with the current provider."}`} />
            <Status ok={s.bufferOAuth && s.bufferEncryption} label="Buffer OAuth" detail={s.bufferOAuth ? "Configured." : "BUFFER_CLIENT_ID/SECRET not set. Personal API keys still work if the encryption key is set."} />
            <Status ok={s.bufferEncryption && s.serviceRole} label="Credential storage" detail="Buffer tokens are encrypted with AES-256-GCM using BUFFER_TOKEN_ENCRYPTION_KEY and stored in a table no browser session can read." />
            <Status ok={s.transcription} label={`Transcription${s.transcriptionProvider ? ` — ${s.transcriptionProvider}` : ""}`} detail={s.transcription ? "Voice notes are sent to the provider only when you click Transcribe." : "TRANSCRIPTION_API_KEY not set: record and play back only; type responses instead."} />
            <Status ok={false} label="Image generation" detail="Not configured. Studio produces clearly-labelled visual briefs instead of images." />
          </ul>
        </Section>

        <Section title="Privacy" description="What ORBIT stores and who receives it.">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Your profile, voice, knowledge, research, drafts and campaigns are stored in ORBIT&apos;s database, isolated to your account by row-level security.</li>
            <li>To analyze research and write drafts, relevant profile, voice, perspective and source text is sent to Google (Gemini API). On the free tier, Google may use submitted content to improve its products — avoid confidential material.</li>
            <li>Audio is sent to the transcription provider only when you choose Transcribe; ORBIT does not keep the audio.</li>
            <li>Content you approve is sent to Buffer. Disconnecting deletes ORBIT&apos;s stored Buffer credentials; posts already in Buffer stay there.</li>
            <li>Everything ORBIT learned about you is visible and deletable in <Link href="/memory" className="text-primary hover:underline">Memory</Link>.</li>
          </ul>
        </Section>

        <Section title="Delete account" description="Permanently delete your account and all ORBIT data.">
          <DeleteAccount />
        </Section>
      </div>
    </div>
  );
}
