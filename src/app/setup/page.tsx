import { redirect } from "next/navigation";
import { integrations } from "@/lib/env";
import { OrbitMark } from "@/components/layout/orbit-mark";

export const dynamic = "force-dynamic";

/** Shown when the database is not configured, instead of a crash. */
export default function SetupPage() {
  const status = integrations();
  if (status.supabase) redirect("/login");
  const rows: [string, boolean, string][] = [
    ["Supabase (required)", status.supabase, "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ["Supabase service role (required for Buffer)", status.serviceRole, "SUPABASE_SERVICE_ROLE_KEY"],
    [`Google Gemini — AI features (model: ${status.aiModel})`, status.ai, "GEMINI_API_KEY, optional GEMINI_MODEL"],
    ["Buffer OAuth", status.bufferOAuth, "BUFFER_CLIENT_ID, BUFFER_CLIENT_SECRET, BUFFER_REDIRECT_URI"],
    ["Token encryption", status.bufferEncryption, "BUFFER_TOKEN_ENCRYPTION_KEY (32 bytes, base64)"],
    ["Voice transcription (optional)", status.transcription, "TRANSCRIPTION_API_KEY"],
  ];
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <OrbitMark className="mb-6 size-10" />
      <h1 className="text-2xl font-semibold">ORBIT needs configuration</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The database connection is not configured, so ORBIT cannot start. Copy <code className="rounded bg-muted px-1">.env.example</code> to{" "}
        <code className="rounded bg-muted px-1">.env.local</code>, fill in the values below, apply the migrations in <code className="rounded bg-muted px-1">supabase/migrations</code>, and restart the server.
      </p>
      <ul className="mt-8 divide-y divide-border rounded-xl border border-border">
        {rows.map(([name, ok, vars]) => (
          <li key={name} className="flex items-start justify-between gap-4 p-4 text-sm">
            <div>
              <p className="font-medium">{name}</p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{vars}</p>
            </div>
            <span className={ok ? "text-success" : "text-muted-foreground"}>{ok ? "Configured" : "Missing"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        Web search discovery is not available with the Gemini provider. Radar researches topics from URLs you submit and RSS/Atom feeds you follow.
      </p>
    </div>
  );
}
