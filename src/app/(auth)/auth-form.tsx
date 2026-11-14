"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/shared";
import { OrbitMark } from "@/components/layout/orbit-mark";
import { signIn, signUp } from "@/app/actions/auth";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, formAction, pending] = useActionState(mode === "login" ? signIn : signUp, null);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <OrbitMark className="mb-4 size-10" />
          <h1 className="text-xl font-semibold">{mode === "login" ? "Sign in to ORBIT" : "Create your ORBIT account"}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Everything happening around you. Turned into something worth saying.</p>
          <p className="mt-3 text-sm text-pretty text-muted-foreground">
            Turn industry news into source-checked posts in your own voice, published through Buffer.{" "}
            <Link href="/" className="text-primary hover:underline">
              See how it works
            </Link>
          </p>
        </div>
        <form action={formAction} className="space-y-4 rounded-xl border border-border bg-card p-6">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Name</Label>
              <Input id="fullName" name="fullName" autoComplete="name" />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
          </div>
          {state && !state.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          {state && state.ok && state.message ? <Notice tone="success">{state.message}</Notice> : null}
          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              New to ORBIT?{" "}
              <Link href="/signup" className="text-primary hover:underline">
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
