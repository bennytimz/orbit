import { executeGraphQL, type ExecuteOptions } from "./client";

/**
 * Post metrics (schema verified 2026-11-19, notes/buffer-schema-2026-11.md).
 * Buffer requires the `insightsRead` scope, which OAuth app clients cannot
 * request: metrics are readable only with a personal API key connection.
 * Buffer refreshes metrics from each network about once a day.
 */
export const SENT_POSTS_WITH_METRICS_QUERY = /* GraphQL */ `
  query OrbitSentPostMetrics($first: Int, $after: String, $input: PostsInput!) {
    posts(first: $first, after: $after, input: $input) {
      edges {
        node {
          id
          channelId
          channelService
          status
          sentAt
          externalLink
          metricsUpdatedAt
          metrics {
            type
            name
            unit
            value
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export interface PostMetricValue {
  type: string;
  name: string;
  unit: "count" | "percentage";
  value: number;
}

export interface SentPostMetrics {
  id: string;
  channelId: string;
  channelService: string;
  status: string;
  sentAt: string | null;
  externalLink: string | null;
  metricsUpdatedAt: string | null;
  metrics: PostMetricValue[] | null;
}

interface PostsPage {
  posts: { edges: { node: SentPostMetrics }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}

/** Sent posts with metrics for the given channels, newest first, up to `maxPages` pages of 50. */
export async function fetchSentPostMetrics(
  token: string,
  params: { organizationId: string; channelIds: string[]; maxPages?: number },
  opts?: ExecuteOptions,
): Promise<SentPostMetrics[]> {
  const out: SentPostMetrics[] = [];
  let after: string | null = null;
  for (let page = 0; page < (params.maxPages ?? 4); page++) {
    const data: PostsPage = await executeGraphQL<PostsPage>(
      token,
      SENT_POSTS_WITH_METRICS_QUERY,
      {
        first: 50,
        after,
        input: {
          organizationId: params.organizationId,
          filter: { status: ["sent"], channelIds: params.channelIds },
          sort: [{ field: "createdAt", direction: "desc" }],
        },
      },
      opts,
    );
    out.push(...data.posts.edges.map((e) => e.node));
    if (!data.posts.pageInfo.hasNextPage || !data.posts.pageInfo.endCursor) break;
    after = data.posts.pageInfo.endCursor;
  }
  return out;
}
