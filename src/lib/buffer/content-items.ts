import { executeGraphQL, type ExecuteOptions } from "./client";
import type { BufferPostStatus, CreatePostInput } from "./operations";

/**
 * Buffer Content Items (experimental "early preview" API, verified against the
 * live schema 2026-11-19; notes/buffer-schema-2026-11.md). `createContentItem`
 * creates one item holding one post per channel. Each post keeps its own text
 * and media. Scope: posts:write (already granted).
 *
 * Failure semantics (from the schema): validation is all-or-nothing, but
 * "variants that fail while being processed after creation are reported per
 * channel in the failure payload; the content item and its variants are still
 * created in that case". The failure payload carries no item ID, so ORBIT
 * treats every failure as an uncertain outcome to be reconciled before retrying.
 */
export const CREATE_CONTENT_ITEM_MUTATION = /* GraphQL */ `
  mutation OrbitCreateContentItem($input: CreateContentItemInput!) {
    createContentItem(input: $input) {
      __typename
      ... on CreateContentItemSuccess {
        content {
          id
          body {
            __typename
            ... on PostContent {
              posts {
                id
                channelId
                status
                dueAt
              }
            }
          }
        }
      }
      ... on CreateContentItemFailure {
        message
        errors {
          __typename
          ... on MutationError {
            message
          }
          ... on CreateContentItemVariantInvalidInputError {
            channelId
            message
          }
          ... on CreateContentItemVariantLimitReachedError {
            channelId
            message
          }
          ... on CreateContentItemVariantNotFoundError {
            channelId
            message
          }
        }
      }
    }
  }
`;

export interface ContentItemPost {
  id: string;
  channelId: string;
  status: BufferPostStatus | null;
  dueAt: string | null;
}

export type CreateContentItemResult =
  | { ok: true; contentItemId: string; posts: ContentItemPost[] }
  | { ok: false; message: string; channelErrors: Record<string, string>; generalErrors: string[] };

interface RawPayload {
  __typename?: string;
  content?: { id: string; body?: { __typename?: string; posts?: ContentItemPost[] } | null } | null;
  message?: string;
  errors?: { __typename?: string; message?: string; channelId?: string }[];
}

/** Interprets the CreateContentItemPayload union. Exported for unit tests. */
export function interpretContentItemPayload(payload: RawPayload | null | undefined): CreateContentItemResult {
  if (payload?.content?.id) return { ok: true, contentItemId: payload.content.id, posts: payload.content.body?.posts ?? [] };
  const channelErrors: Record<string, string> = {};
  const generalErrors: string[] = [];
  for (const e of payload?.errors ?? []) {
    const msg = e.message ?? e.__typename ?? "Unknown error";
    if (e.channelId) channelErrors[e.channelId] = msg;
    else generalErrors.push(msg);
  }
  return { ok: false, message: payload?.message ?? "Buffer did not confirm the content item was created.", channelErrors, generalErrors };
}

export async function createContentItem(
  token: string,
  input: { organizationId: string; title?: string; posts: CreatePostInput[] },
  opts?: ExecuteOptions,
): Promise<CreateContentItemResult> {
  const data = await executeGraphQL<{ createContentItem: RawPayload }>(token, CREATE_CONTENT_ITEM_MUTATION, { input }, { ...opts, mutation: true, timeoutMs: opts?.timeoutMs ?? 30_000 });
  return interpretContentItemPayload(data.createContentItem);
}
