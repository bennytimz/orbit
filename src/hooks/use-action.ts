"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/**
 * Runs a server action with pending state and toast feedback. Errors are
 * always surfaced; success messages only when the action provides one.
 */
export function useAction<Args extends unknown[], T>(action: (...args: Args) => Promise<ActionResult<T>>, opts: { silentSuccess?: boolean } = {}) {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);

  const run = useCallback(
    (...args: Args): Promise<ActionResult<T>> =>
      new Promise((resolve) => {
        setRunning(true);
        startTransition(async () => {
          try {
            const result = await action(...args);
            if (!result.ok) toast.error(result.error);
            else if (result.message && !opts.silentSuccess) toast.success(result.message);
            resolve(result);
          } catch {
            const failure = { ok: false as const, error: "Something went wrong. Please try again." };
            toast.error(failure.error);
            resolve(failure);
          } finally {
            setRunning(false);
          }
        });
      }),
    [action, opts.silentSuccess],
  );

  return { run, pending: pending || running };
}
