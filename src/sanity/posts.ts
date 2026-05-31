// Typed read functions for the blog-component (TASK-002, hardened in TASK-010).
//
// Thin wrappers over `client.fetch` that pair each GROQ query with its return
// type, so callers get end-to-end type safety without touching raw GROQ.
//
// TASK-010: every `client.fetch` rejection is normalized to a typed
// `BlogReadError` (the original error is preserved as `cause`, never swallowed)
// so consumer-facing error shapes are part of the contract, not raw SDK errors.

import type { SanityClient } from '@sanity/client'
import {
  POST_BY_SLUG_PREVIEW_QUERY,
  POST_BY_SLUG_QUERY,
  POST_LIST_QUERY,
} from './queries'
import { BlogReadError } from './read-error'
import type { Post, PostListItem } from './types'

/**
 * Fetch the published post list (cards). Future-dated posts are excluded by the
 * query's `publishedAt <= now()` filter; ordering is `featured desc,
 * publishedAt desc`.
 *
 * @throws {BlogReadError} if the underlying fetch rejects (original as `cause`).
 */
export async function getPostList(client: SanityClient): Promise<PostListItem[]> {
  try {
    return await client.fetch<PostListItem[]>(POST_LIST_QUERY)
  } catch (cause) {
    throw new BlogReadError('Failed to fetch the post list from Sanity.', {
      cause,
      operation: 'getPostList',
    })
  }
}

/** Options for {@link getPostBySlug}. */
export interface GetPostBySlugOptions {
  /**
   * When `true`, use the PREVIEW query, which omits the `publishedAt <= now()`
   * filter so a direct slug lookup reaches scheduled/future-dated (unpublished)
   * posts. Use only for trusted preview surfaces (e.g. an editor previewing a
   * draft). Defaults to `false` (airtight: scheduled posts are not reachable).
   */
  allowUnpublished?: boolean
}

/**
 * Fetch a single post by its slug, with the author expanded, an absent body
 * coalesced to `[]`, and `internalLink` markDefs resolved to slugs. Resolves to
 * `null` when no post matches the slug.
 *
 * Scheduling asymmetry (TASK-010): by DEFAULT this is AIRTIGHT — it mirrors the
 * list query's `defined(publishedAt) && publishedAt <= now()` filter, so a
 * future-dated/scheduled post is NOT reachable by slug. Pass
 * `{ allowUnpublished: true }` to use the PREVIEW query and reach scheduled
 * posts by direct slug (preview/editor use cases only).
 *
 * @throws {BlogReadError} if the underlying fetch rejects (original as `cause`).
 */
export async function getPostBySlug(
  client: SanityClient,
  slug: string,
  options?: GetPostBySlugOptions,
): Promise<Post | null> {
  const query = options?.allowUnpublished ? POST_BY_SLUG_PREVIEW_QUERY : POST_BY_SLUG_QUERY
  try {
    return await client.fetch<Post | null>(query, { slug })
  } catch (cause) {
    throw new BlogReadError(`Failed to fetch the post "${slug}" from Sanity.`, {
      cause,
      operation: 'getPostBySlug',
      slug,
    })
  }
}
