// Configurable Sanity read client for the blog-component (TASK-002).
//
// Wraps `@sanity/client`'s `createClient` with read-friendly defaults
// (`useCdn: true`, per blog-implementation-guide.md section 4). The consuming
// app supplies its own `projectId`/`dataset` — NOTHING is hardcoded to any one
// Sanity project (PROJECT.md: "CMS is kept (not abstracted)").
//
// @sanity/client is a runtime dependency declared in `dependencies` (not
// devDependencies) and marked `external` in vite.config.ts, so it is NOT
// bundled into the library — consumers install it transitively.
//
// --- AC4 MANUAL VERIFICATION (cannot be unit-tested without live creds) ------
// Reads only succeed against a real dataset when, in addition to valid config:
//   1. The dataset is public OR a read token is supplied (public CDN reads need
//      no token for a public dataset).
//   2. The CONSUMING ORIGIN is registered in the Sanity project's CORS Origins
//      (sanity.io/manage/project/<id>/api -> CORS Origins). The browser client
//      fails to load posts otherwise. See guide section 11 + problem #2.
// To verify: create a client with a real projectId, add http://localhost:<port>
// to CORS Origins, then call getPostList(client) / getPostBySlug(client, slug).
// -----------------------------------------------------------------------------

import { createClient, type SanityClient } from '@sanity/client'

/**
 * Configuration accepted by {@link createBlogClient}. Only `projectId` is
 * required; `dataset` and `apiVersion` fall back to sensible defaults.
 */
export interface BlogSanityConfig {
  /** Sanity project id. Required — never hardcoded by the library. */
  projectId: string
  /** Dataset name. Defaults to `'production'`. */
  dataset?: string
  /** Pinned API version (YYYY-MM-DD). Defaults to {@link DEFAULT_API_VERSION}. */
  apiVersion?: string
  /**
   * Use the Sanity CDN. Defaults to `true` for fast, cacheable reads. Pass
   * `false` only when you need always-fresh data (e.g. previewing drafts).
   */
  useCdn?: boolean
  /**
   * Optional read token, for private datasets. Public datasets need none.
   * Never embed a WRITE token here — writes are out of scope (TASK-005).
   */
  token?: string
}

/** Default dataset, matching the guide. */
export const DEFAULT_DATASET = 'production'

/**
 * Pinned API version. Pinning keeps query behavior stable across `@sanity/client`
 * upgrades; bump deliberately, never to "latest".
 */
export const DEFAULT_API_VERSION = '2024-01-01'

/**
 * Create a read-configured Sanity client from consumer-supplied config.
 *
 * @throws if `projectId` is missing — the library has no fallback project.
 */
export function createBlogClient(config: BlogSanityConfig): SanityClient {
  if (!config || !config.projectId) {
    throw new Error(
      'createBlogClient: `projectId` is required. Supply your own Sanity project id; the library does not hardcode one.',
    )
  }

  return createClient({
    projectId: config.projectId,
    dataset: config.dataset ?? DEFAULT_DATASET,
    apiVersion: config.apiVersion ?? DEFAULT_API_VERSION,
    useCdn: config.useCdn ?? true,
    ...(config.token ? { token: config.token } : {}),
  })
}
