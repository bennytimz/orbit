import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

/** Shared helpers for E2E setup/teardown. Secrets are read from the local env and never printed. */
export const STATE_FILE = path.join(process.cwd(), "tests", "e2e", ".state.json");

export interface E2EState {
  userId: string;
  email: string;
  password: string;
}

export function adminClient() {
  loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("E2E tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function readState(): E2EState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as E2EState;
  } catch {
    return null;
  }
}

export function writeState(state: E2EState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 });
}

export function clearState() {
  fs.rmSync(STATE_FILE, { force: true });
}
