import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth";
import { ConfigurationError } from "@/lib/env";
import { AIServiceError } from "@/lib/ai/errors";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: string };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, code?: string): ActionResult<never> {
  return { ok: false, error, code };
}

/**
 * Converts thrown errors into user-safe messages. Internal details are logged
 * server-side only (never tokens: callers must not put secrets in messages).
 */
export function toFailure(error: unknown, fallback: string): ActionResult<never> {
  if (error instanceof UnauthorizedError) return fail(error.message, "unauthorized");
  if (error instanceof ConfigurationError) {
    return fail(`${error.message} Ask the workspace owner to configure it in the environment.`, "not_configured");
  }
  if (error instanceof AIServiceError) return fail(error.userMessage, error.code);
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return fail(first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input.", "invalid_input");
  }
  console.error(`[orbit] ${fallback}`, error instanceof Error ? error.message : error);
  return fail(fallback);
}

/** Wraps an action body with consistent error handling. */
export async function runAction<T>(fallback: string, body: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await body();
  } catch (error) {
    // Let Next.js redirects/notFound propagate.
    if (error && typeof error === "object" && "digest" in error && typeof (error as { digest: unknown }).digest === "string") {
      const digest = (error as { digest: string }).digest;
      if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) throw error;
    }
    return toFailure(error, fallback);
  }
}
