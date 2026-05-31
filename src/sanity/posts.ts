// Typed read functions for the blog-component (TASK-002).
//
// Thin wrappers over `client.fetch` that pair each GROQ query with its return
// type, so callers get end-to-end type safety without touching raw GROQ.

import type { SanityClient } from '@sanity/client'
import { POST_BY_SLUG_QUERY, POST_LIST_QUERY } from './queries'
import type { Post, PostListItem } from './types'

/**
 * Fetch the published post list (cards). Future-dated posts are excluded by the
 * query's `publishedAt <= now()` filter; ordering is `featured desc,
 * publishedAt desc`.
 */
export function getPostList(client: SanityClient): Promise<PostListItem[]> {
  return client.fetch<PostListItem[]>(POST_LIST_QUERY)
}

/**
 * Fetch a single published post by its slug, with the author expanded and
 * `internalLink` markDefs resolved to slugs. Resolves to `null` when no post
 * matches the slug.
 */
export function getPostBySlug(client: SanityClient, slug: string): Promise<Post | null> {
  return client.fetch<Post | null>(POST_BY_SLUG_QUERY, { slug })
}
