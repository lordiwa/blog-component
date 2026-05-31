// Publish defaults for newly-created posts (TASK-011).
//
// =====================================================================
//  READ-BACK CONTRACT — why this exists.
// =====================================================================
// The TASK-002 read path filters on two fields that a brand-new post does not
// otherwise carry:
//   - `POST_BY_SLUG_QUERY` matches on `slug.current`;
//   - `POST_LIST_QUERY` requires `defined(publishedAt) && publishedAt <= now()`.
// So a post saved on CREATE without a `slug.current` and a past/now
// `publishedAt` is persisted but INVISIBLE to both read queries — it can never
// be listed or fetched back. The product decision (TASK-011) closes that gap at
// the library level: on CREATE we auto-derive `slug` from the title (via the
// same `slugify` the rest of the write path uses) and stamp `publishedAt = now`.
//
// What this deliberately does NOT do:
//   - It NEVER touches an UPDATE (a post with an `_id`): an existing document
//     already owns its slug/publishedAt, and silently re-deriving them on every
//     edit would change the post's URL and publish date. UPDATE is returned
//     untouched.
//   - It NEVER overwrites a host-supplied NON-EMPTY value on CREATE: a real
//     `slug.current` or a non-empty `publishedAt` provided by the caller wins.
//     (A blank/empty `slug.current` is treated as ABSENT and re-derived; an
//     empty/whitespace `publishedAt` is treated as ABSENT and re-stamped — see
//     below — because both would otherwise break the read queries.)
//   - It NEVER emits an empty slug: a blank/whitespace title (or one that
//     slugifies to `''`) leaves `slug` unset rather than persisting
//     `{ current: '' }`.
//
// =====================================================================
//  SLUG UNIQUENESS — read this (acceptance criterion #1).
// =====================================================================
// The slug is derived DETERMINISTICALLY from the title and is NOT guaranteed
// unique: two posts with the same title produce the SAME `slug.current`. Because
// `POST_BY_SLUG_QUERY` ends in `[0]`, only ONE of the collided documents is ever
// reachable by slug — the other(s) become unaddressable. This helper is pure
// (it cannot read Sanity), so it does NOT and CANNOT perform a live uniqueness
// check. Ensuring slug uniqueness is therefore the HOST's responsibility:
//   - supply your own unique `slug` on the post before saving, OR
//   - set `autoPublish={false}` (on `<BlogAuthor>`) / skip this helper, and mint
//     a unique slug yourself — e.g. append a short id or date such as
//     `slugify(title) + '-' + shortId` or `... + '-2026-05-30'`.
//
// This is pure, token-free string/clone logic — NO secrets, NO Sanity client.
// It is safe to run anywhere (browser or server). The TOKEN-bearing pieces (the
// write client, `createReferenceWriteAdapter`) remain server-only; this helper
// does not change the security model. Every symbol exported here is part of the
// published API surface and subject to semver.

import { slugify } from './slugify'
import type { BlogPostInput } from './adapter'

/** The Sanity `slug` value shape written to `post.slug`. */
interface SlugValue {
  _type: 'slug'
  current: string
}

/** Options for {@link withPublishDefaults}. */
export interface PublishDefaultsOptions {
  /**
   * The timestamp used for an injected `publishedAt` on CREATE. Defaults to
   * `new Date().toISOString()`. Injectable so callers (and tests) can pin it.
   */
  now?: string
}

/**
 * Return a shallow clone of `post` with the TASK-011 publish defaults applied.
 *
 * - UPDATE (`post._id` present): returned unchanged (a clone, nothing injected).
 * - CREATE (no `_id`):
 *   - if `slug.current` is absent/empty AND `slugify(title)` is non-empty, set
 *     `slug = { _type: 'slug', current: slugify(title) }`;
 *   - if `publishedAt` is absent/null/empty-or-whitespace, set it to
 *     `options.now ?? now()`.
 *
 * Never mutates the input. Only a host-supplied NON-EMPTY `slug.current` /
 * `publishedAt` is trusted verbatim; blank values are treated as absent.
 *
 * Slug uniqueness is NOT guaranteed (same title -> same slug); see the file
 * header — uniqueness is the host's responsibility.
 */
export function withPublishDefaults(
  post: BlogPostInput,
  options?: PublishDefaultsOptions,
): BlogPostInput {
  // Always work on a clone so the caller's object is never mutated.
  const next: BlogPostInput = { ...post }

  // UPDATE: an existing document owns its slug/publishedAt — inject nothing.
  if (next._id) return next

  // CREATE: derive a slug from the title only when none was supplied and the
  // title actually slugifies to something (never persist an empty slug).
  const hasSlug = !!(next.slug as SlugValue | undefined)?.current
  if (!hasSlug) {
    const title = typeof next.title === 'string' ? next.title : ''
    const current = slugify(title)
    if (current) {
      next.slug = { _type: 'slug', current } satisfies SlugValue
    }
  }

  // CREATE: stamp publishedAt unless the host supplied a NON-EMPTY value. Only a
  // non-empty string is trusted verbatim — null/undefined/empty/whitespace are
  // all treated as absent, because an empty `publishedAt` fails the read query's
  // `defined(publishedAt) && publishedAt <= now()` filter and would hide the post.
  const publishedAt = next.publishedAt
  const hasPublishedAt = typeof publishedAt === 'string' && publishedAt.trim() !== ''
  if (!hasPublishedAt) {
    next.publishedAt = options?.now ?? new Date().toISOString()
  }

  return next
}
