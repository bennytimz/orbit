import { executeGraphQL, type ExecuteOptions } from "./client";

/**
 * Buffer Ideas. Verified against the live schema at https://api.buffer.com on 2026-11-14:
 *   createIdea(input: CreateIdeaInput!): CreateIdeaPayload!
 *   CreateIdeaInput { organizationId: ID!, content: IdeaContentInput!, group, cta, templateId }
 *   IdeaContentInput { title, text, date, services, tags, media, aiAssisted }
 *   CreateIdeaPayload = Idea | IdeaResponse | InvalidInputError | UnauthorizedError
 *                     | UnexpectedError | LimitReachedError
 * Requires the `ideas:write` OAuth scope.
 */

export const CREATE_IDEA_MUTATION = /* GraphQL */ `
  mutation OrbitCreateIdea($input: CreateIdeaInput!) {
    createIdea(input: $input) {
      __typename
      ... on Idea {
        id
        organizationId
        createdAt
      }
      ... on IdeaResponse {
        idea {
          id
          organizationId
          createdAt
        }
      }
      ... on InvalidInputError {
        message
      }
      ... on UnauthorizedError {
        message
      }
      ... on UnexpectedError {
        message
      }
      ... on LimitReachedError {
        message
      }
    }
  }
`;

export interface CreateIdeaInput {
  organizationId: string;
  content: { title?: string; text?: string; aiAssisted?: boolean };
}

export interface CreatedIdea {
  id: string;
  organizationId: string | null;
  createdAt: number | null;
}

export type CreateIdeaErrorType = "InvalidInputError" | "UnauthorizedError" | "UnexpectedError" | "LimitReachedError" | "Unknown";

export type CreateIdeaResult = { ok: true; idea: CreatedIdea } | { ok: false; errorType: CreateIdeaErrorType; message: string };

interface RawIdea {
  id?: string | null;
  organizationId?: string | null;
  createdAt?: number | null;
}

export interface RawCreateIdeaPayload extends RawIdea {
  __typename?: string;
  idea?: RawIdea | null;
  message?: string | null;
}

const ERROR_TYPES = new Set<CreateIdeaErrorType>(["InvalidInputError", "UnauthorizedError", "UnexpectedError", "LimitReachedError"]);

function toIdea(raw: RawIdea | null | undefined): CreatedIdea | null {
  if (!raw || typeof raw.id !== "string" || raw.id.length === 0) return null;
  return { id: raw.id, organizationId: raw.organizationId ?? null, createdAt: typeof raw.createdAt === "number" ? raw.createdAt : null };
}

/**
 * Interprets the CreateIdeaPayload union. Success only when Buffer returns an
 * idea with an ID. Exported for unit tests.
 */
export function interpretCreateIdeaPayload(payload: RawCreateIdeaPayload | null | undefined): CreateIdeaResult {
  const typename = payload?.__typename;
  if (typename === "Idea") {
    const idea = toIdea(payload);
    if (idea) return { ok: true, idea };
  }
  if (typename === "IdeaResponse") {
    const idea = toIdea(payload?.idea);
    if (idea) return { ok: true, idea };
  }
  if (typename && ERROR_TYPES.has(typename as CreateIdeaErrorType)) {
    return { ok: false, errorType: typename as CreateIdeaErrorType, message: payload?.message || "Buffer rejected the idea." };
  }
  return { ok: false, errorType: "Unknown", message: "Buffer did not confirm the idea was created." };
}

const MAX_SUMMARY = 500;

/** Shortens a summary at a word boundary. Exported for unit tests. */
export function shortSummary(summary: string, max = MAX_SUMMARY): string {
  const clean = summary.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, "")}…`;
}

/** Builds the idea content from a discovery: title, short summary and source link. */
export function buildDiscoveryIdeaContent(params: { title: string; summary: string; sourceUrl: string | null }): CreateIdeaInput["content"] {
  const parts = [shortSummary(params.summary)];
  if (params.sourceUrl) parts.push(`Source: ${params.sourceUrl}`);
  return { title: params.title.trim().slice(0, 300), text: parts.filter(Boolean).join("\n\n") };
}

export async function createIdea(token: string, input: CreateIdeaInput, opts?: ExecuteOptions): Promise<CreateIdeaResult> {
  const data = await executeGraphQL<{ createIdea: RawCreateIdeaPayload }>(token, CREATE_IDEA_MUTATION, { input }, { ...opts, mutation: true });
  return interpretCreateIdeaPayload(data.createIdea);
}

export type SaveIdeaOnceResult =
  | { status: "already_saved"; ideaId: string }
  | { status: "created"; ideaId: string }
  | { status: "failed"; errorType: CreateIdeaErrorType; message: string };

/**
 * Duplicate protection: when an Idea ID is already recorded for the item,
 * Buffer is not called. Otherwise creates the idea and records the returned ID.
 * Exported for unit tests.
 */
export async function saveIdeaOnce(deps: {
  findRecordedIdeaId: () => Promise<string | null>;
  create: () => Promise<CreateIdeaResult>;
  record: (ideaId: string) => Promise<void>;
}): Promise<SaveIdeaOnceResult> {
  const existing = await deps.findRecordedIdeaId();
  if (existing) return { status: "already_saved", ideaId: existing };
  const result = await deps.create();
  if (!result.ok) return { status: "failed", errorType: result.errorType, message: result.message };
  await deps.record(result.idea.id);
  return { status: "created", ideaId: result.idea.id };
}

export const IDEA_LOG_ACTION = "buffer_idea_created";

/** Maps discovery ID → recorded Buffer Idea ID from activity log rows. Exported for unit tests. */
export function recordedIdeaIds(rows: { resource_id: string | null; metadata: unknown }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const ideaId = (row.metadata as { buffer_idea_id?: unknown } | null)?.buffer_idea_id;
    if (row.resource_id && typeof ideaId === "string" && ideaId && !out[row.resource_id]) out[row.resource_id] = ideaId;
  }
  return out;
}
