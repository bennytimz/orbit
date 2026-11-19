# Buffer GraphQL schema findings (2026-11-19)

Source: live introspection of `https://api.buffer.com` (personal API key, org `6af7549d676fbe883b3cea48`), plus the docs at https://developers.buffer.com read the same day. Nothing below is inferred unless it says so.

## Media / assets
- `CreatePostInput.assets: [AssetInput!]!` with **default `[]`**, so text-only posts may omit it. `needsApproval: Boolean!` likewise defaults to `false`.
- `AssetInput` must set exactly one of `image: ImageAssetInput`, `video: VideoAssetInput` or `document: DocumentAssetInput`.
- `ImageAssetInput { url: String!, thumbnailUrl: String, metadata: ImageMetadataInput }`. `ImageMetadataInput { altText: String!, animatedThumbnail, userTags }`, so alt text is required whenever `metadata` is sent.
- `CreatePostInput` description: `metadata.{service}.linkAttachment` cannot be combined with a non-empty `assets` array.
- **There is no upload endpoint.** Docs (guides/hosting-media): the URL "must point to a file that is reachable over the public internet without authentication" and "must stay reachable until the post publishes". The docs warn against S3 pre-signed and Cloudinary signed-delivery URLs.
- Live check: Buffer stores the URL we send as `ImageAsset.source` and does not rewrite it to a Buffer-hosted copy. ORBIT therefore sends signed URLs valid for 365 days (TD-021).
- `MediaFormat` enum: `gif jpeg mov mp4 pdf png webm`.
- The `configuration(input:{organizationId})` query (`ChannelConfiguration.content` / `ServiceConfiguration.content` with `CountRule`, `FileSizeRule`, `FormatRule`) returned only **comment** rules for every service. No post or media limits are exposed. Image counts, sizes and ratios therefore come from platform documentation (see `src/engines/studio/media.ts`).

## Instagram
- `InstagramPostMetadataInput { type: PostType!, shouldShareToFeed: Boolean!, firstComment, geolocation, isAiGenerated, link, stickerFields }`.
- `PostType` enum: `carousel event ghost_post offer post reel short story thread whats_new`.
- Neither the schema nor the docs state that Instagram requires media. The docs only show image examples. ORBIT keeps its existing rule that Instagram requires media.
- No Instagram channel is connected to the test org, so Instagram could not be tested live.

## Metrics
- `Post.metrics: [PostMetric!]` ("null if not yet sent"), `Post.metricsUpdatedAt`, `Post.sentAt`, `Post.externalLink`.
- `PostMetric { type: PostMetricType!, name, description, unit: count|percentage, value: Float! }`.
- `aggregatedPostMetrics(input:{organizationId, startDateTime, endDateTime, channelIds, tags})`.
- **Scope:** docs (guides/post-metrics): "Reading metrics requires the `insightsRead` scope, which an App Client cannot request through OAuth." Metrics are therefore readable only with a **personal API key** connection.
- Refresh cadence: daily, up to about 24 h behind.
- `ChannelConfiguration.authorizationStatus` showed `insights: ok` for both channels.

## Grouping platform variants
- **Content Items** (marked "early preview", "Experimental API surface"):
  - `createContentItem(input:{organizationId, posts:[CreatePostInput!]!, title, tagIds, targetDate})`: all-or-nothing, at most one post per channel, each post keeps its own text and media.
  - `addPostToContentItem`, `removePostFromContentItem`, `deleteContentItem` (all-or-nothing; blocked once a post is publishing or published), `contentItem`, `contentItems`. `Post.contentItemId`.
  - `addPostToContentItem` fails while the item is still a channel-less draft. Existing posts therefore cannot be grouped without creating new posts.
- Tags: `createTag`/`tagIds` (also experimental).
- Scopes (guides/content-items): reads need `posts:read`, writes need `posts:write`. Both are already granted, so no scope change is needed.

## Edit / delete
- `deletePost(input:{id})` → `DeletePostSuccess { id } | VoidMutationError`.
- `editPost(input: EditPostInput)`: the same fields as create plus `id`. Omitted fields keep their current value.
- The docs don't state a scope for these. `posts:write` is the closest match (inference). ORBIT's product still doesn't edit or delete Buffer posts. `deletePost` was used only by the live-test cleanup scripts.

## OAuth scopes (guides/authentication)
`account:read/write`, `posts:read/write`, `ideas:read/write`, `snippets:read/write`, `notes:read/write`, `offline_access`. `insightsRead` is not requestable via OAuth.
**Scope change needed for the features built: none** (current: `account:read posts:read posts:write ideas:write offline_access`).
