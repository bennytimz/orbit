/**
 * Minimal Buffer GraphQL client. Docs: https://developers.buffer.com/guides/error-handling.html
 * - HTTP 200 does not imply success: top-level `errors` carry system errors
 *   (extensions.code: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, UNEXPECTED, RATE_LIMIT_EXCEEDED).
 * - Typed mutation errors arrive inside `data` (e.g. `... on MutationError { message }`).
 * - 429 responses carry Retry-After.
 * Tokens are never logged.
 */

export const BUFFER_API_URL = "https://api.buffer.com";

export type BufferErrorKind = "unauthorized" | "forbidden" | "not_found" | "rate_limited" | "server" | "network" | "timeout" | "graphql";

export class BufferApiError extends Error {
  constructor(
    public readonly kind: BufferErrorKind,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
    /** True when the request may have been applied by Buffer (ambiguous outcome). */
    public readonly ambiguous: boolean = false,
  ) {
    super(message);
    this.name = "BufferApiError";
  }
}

interface GraphQLErrorShape {
  message?: string;
  extensions?: { code?: string };
}

export function classifyGraphQLErrors(errors: GraphQLErrorShape[]): BufferApiError {
  const first = errors[0] ?? {};
  const code = first.extensions?.code;
  const message = first.message ?? "Buffer returned an error.";
  switch (code) {
    case "UNAUTHORIZED":
      return new BufferApiError("unauthorized", message);
    case "FORBIDDEN":
      return new BufferApiError("forbidden", message);
    case "NOT_FOUND":
      return new BufferApiError("not_found", message);
    case "RATE_LIMIT_EXCEEDED":
      return new BufferApiError("rate_limited", message);
    case "UNEXPECTED":
      return new BufferApiError("server", message);
    default:
      return new BufferApiError("graphql", message);
  }
}

export interface ExecuteOptions {
  /** Mutations that create external state: network failures are ambiguous. */
  mutation?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function executeGraphQL<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
  opts: ExecuteOptions = {},
): Promise<T> {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await doFetch(BUFFER_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new BufferApiError(
      aborted ? "timeout" : "network",
      aborted ? "Buffer did not respond in time." : "Could not reach Buffer.",
      null,
      Boolean(opts.mutation),
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after"));
    throw new BufferApiError("rate_limited", "Buffer rate limit reached. Please wait before trying again.", Number.isFinite(retry) ? retry : null);
  }
  if (res.status === 401) throw new BufferApiError("unauthorized", "Buffer rejected the credentials.");
  if (res.status === 403) throw new BufferApiError("forbidden", "Buffer denied access to this resource.");

  let json: { data?: T | null; errors?: GraphQLErrorShape[] };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new BufferApiError("server", `Buffer returned an unreadable response (HTTP ${res.status}).`, null, Boolean(opts.mutation) && res.status >= 500);
  }
  if (res.status >= 500) {
    throw new BufferApiError("server", `Buffer server error (HTTP ${res.status}).`, null, Boolean(opts.mutation));
  }
  if (json.errors && json.errors.length > 0) {
    const err = classifyGraphQLErrors(json.errors);
    // UNEXPECTED errors on a mutation leave the outcome uncertain.
    if (opts.mutation && err.kind === "server") throw new BufferApiError("server", err.message, null, true);
    throw err;
  }
  if (json.data === undefined || json.data === null) {
    throw new BufferApiError("server", "Buffer returned no data.", null, Boolean(opts.mutation));
  }
  return json.data;
}
