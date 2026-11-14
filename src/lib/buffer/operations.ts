import { executeGraphQL, type ExecuteOptions } from "./client";

/**
 * GraphQL operations, using only fields and types documented at
 * https://developers.buffer.com (verified 2026-11-13; see TECHNICAL_DECISIONS.md TD-008).
 */

export const ACCOUNT_QUERY = /* GraphQL */ `
  query OrbitAccount {
    account {
      id
      email
      organizations {
        id
        name
      }
    }
  }
`;

export const CHANNELS_QUERY = /* GraphQL */ `
  query OrbitChannels($input: ChannelsInput!) {
    channels(input: $input) {
      id
      name
      displayName
      service
      avatar
      isQueuePaused
      isDisconnected
      isLocked
      organizationId
    }
  }
`;

export const POSTS_QUERY = /* GraphQL */ `
  query OrbitPosts($first: Int, $after: String, $input: PostsInput!) {
    posts(first: $first, after: $after, input: $input) {
      edges {
        cursor
        node {
          id
          text
          dueAt
          channelId
          status
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const CREATE_POST_MUTATION = /* GraphQL */ `
  mutation OrbitCreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess {
        post {
          id
          text
          dueAt
          status
          channelId
        }
      }
      ... on MutationError {
        message
      }
    }
  }
`;

export interface BufferAccount {
  id: string;
  email: string | null;
  organizations: { id: string; name: string }[];
}

export interface BufferChannel {
  id: string;
  name: string;
  displayName: string | null;
  service: string;
  avatar: string | null;
  isQueuePaused: boolean | null;
  isDisconnected: boolean | null;
  isLocked: boolean | null;
  organizationId: string;
}

export type BufferPostStatus = "draft" | "error" | "needs_approval" | "scheduled" | "sending" | "sent";

export interface BufferPost {
  id: string;
  text: string | null;
  dueAt: string | null;
  channelId: string;
  status: BufferPostStatus;
  createdAt: string | null;
}

export type ShareMode = "addToQueue" | "customScheduled" | "shareNext" | "shareNow";

export interface CreatePostInput {
  text: string;
  channelId: string;
  schedulingType: "automatic" | "notification";
  mode: ShareMode;
  dueAt?: string;
  saveToDraft?: boolean;
  aiAssisted?: boolean;
  source?: string;
  /** X threads: every part, including the first (top-level `text` repeats part 1). */
  metadata?: { twitter: { thread: { text: string }[] } };
}

export type CreatePostResult =
  | { ok: true; post: { id: string; text: string | null; dueAt: string | null; status: BufferPostStatus | null; channelId: string | null } }
  | { ok: false; errorType: string; message: string };

export async function fetchAccount(token: string, opts?: ExecuteOptions): Promise<BufferAccount> {
  const data = await executeGraphQL<{ account: BufferAccount }>(token, ACCOUNT_QUERY, {}, opts);
  return { ...data.account, organizations: data.account.organizations ?? [] };
}

export async function fetchChannels(token: string, organizationId: string, opts?: ExecuteOptions): Promise<BufferChannel[]> {
  const data = await executeGraphQL<{ channels: BufferChannel[] }>(token, CHANNELS_QUERY, { input: { organizationId } }, opts);
  return data.channels ?? [];
}

export async function fetchPosts(
  token: string,
  params: { organizationId: string; statuses?: BufferPostStatus[]; channelIds?: string[]; first?: number; after?: string; sortDueAtAsc?: boolean },
  opts?: ExecuteOptions,
): Promise<{ posts: BufferPost[]; hasNextPage: boolean; endCursor: string | null }> {
  const filter: Record<string, unknown> = {};
  if (params.statuses?.length) filter.status = params.statuses;
  if (params.channelIds?.length) filter.channelIds = params.channelIds;
  const input: Record<string, unknown> = { organizationId: params.organizationId, filter };
  input.sort = params.sortDueAtAsc ? [{ field: "dueAt", direction: "asc" }] : [{ field: "createdAt", direction: "desc" }];
  const data = await executeGraphQL<{
    posts: { edges: { node: BufferPost }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
  }>(token, POSTS_QUERY, { first: params.first ?? 25, after: params.after ?? null, input }, opts);
  return {
    posts: data.posts.edges.map((e) => e.node),
    hasNextPage: data.posts.pageInfo.hasNextPage,
    endCursor: data.posts.pageInfo.endCursor,
  };
}

interface RawCreatePayload {
  __typename?: string;
  post?: { id: string; text: string | null; dueAt: string | null; status: BufferPostStatus | null; channelId: string | null };
  message?: string;
}

/** Interprets the PostActionPayload union. Exported for unit tests. */
export function interpretCreatePayload(payload: RawCreatePayload | null | undefined): CreatePostResult {
  if (payload?.post?.id) return { ok: true, post: payload.post };
  if (payload?.message) return { ok: false, errorType: payload.__typename ?? "MutationError", message: payload.message };
  return { ok: false, errorType: payload?.__typename ?? "Unknown", message: "Buffer did not confirm the post was created." };
}

export async function createPost(token: string, input: CreatePostInput, opts?: ExecuteOptions): Promise<CreatePostResult> {
  const data = await executeGraphQL<{ createPost: RawCreatePayload }>(token, CREATE_POST_MUTATION, { input }, { ...opts, mutation: true });
  return interpretCreatePayload(data.createPost);
}
