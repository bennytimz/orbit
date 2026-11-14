"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, PlugZap } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { connectWithApiKey } from "@/app/actions/publishing";
import { cn } from "@/lib/utils";

export function ConnectBuffer({ oauthAvailable, apiKeyAvailable }: { oauthAvailable: boolean; apiKeyAvailable: boolean }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const connect = useAction(connectWithApiKey);

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <PlugZap className="mb-3 size-5 text-primary" />
        <h2 className="font-semibold">Connect with Buffer</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Sign in to Buffer and approve access (OAuth with PKCE). ORBIT requests only: read account, read posts, create posts, and stay signed in.
        </p>
        {oauthAvailable ? (
          // A plain link: the OAuth flow is a full-page redirect handled server-side.
          <a href="/api/buffer/connect" className={buttonVariants()}>
            Connect Buffer
          </a>
        ) : (
          <p className="text-sm text-warning">OAuth isn&apos;t configured on this server. Use a personal API key instead.</p>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <KeyRound className="mb-3 size-5 text-muted-foreground" />
        <h2 className="font-semibold">Use a personal API key</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Create a key in{" "}
          <a href="https://publish.buffer.com/settings/api" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            Buffer → Settings → API
          </a>
          . It is encrypted at rest and never sent to your browser again.
        </p>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await connect.run(key);
            if (r.ok) {
              setKey("");
              router.refresh();
            }
          }}
        >
          <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Buffer API key" aria-label="Buffer API key" disabled={!apiKeyAvailable} />
          <Button type="submit" variant="outline" disabled={!apiKeyAvailable || !key.trim() || connect.pending} className={cn("shrink-0")}>
            {connect.pending ? <Loader2 className="animate-spin" /> : null} Connect
          </Button>
        </form>
      </div>
    </section>
  );
}
