// URL-safe slug generation for the blog-component write path (TASK-011).
//
// =====================================================================
//  WHY THIS LIVES IN THE LIBRARY (and not just in the dev playground).
// =====================================================================
// TASK-007's `<BlogAuthor>` deliberately does NOT auto-mint a `slug` or
// `publishedAt` (see its READ-BACK CONTRACT note): those are product decisions
// owned by the host. TASK-011 makes the decision for the create path — a NEW
// post needs a `slug.current` (and a `publishedAt`) or the TASK-002 read
// queries can never find it again:
//   - `POST_BY_SLUG_QUERY` matches on `slug.current`;
//   - `POST_LIST_QUERY` requires `defined(publishedAt) && publishedAt <= now()`.
//
// The actual slug/publishedAt INJECTION happens server-side (in the host's
// `SanityWriteAdapter.save`, e.g. the dev playground's `/api/save` middleware),
// so the only piece of genuinely reusable, testable logic is this normalizer.
// It is therefore part of the published API surface (re-exported from
// `src/sanity/write/index.ts` and `src/index.ts`) and subject to semver.
//
// This is pure string logic — NO secrets, NO Sanity client, NO token. It is
// safe to run anywhere (browser or server). The TOKEN-bearing pieces (the write
// client, `createReferenceWriteAdapter`) remain server-only; this helper does
// not change the security model.

/** Default slug length cap. Long enough for descriptive slugs, short enough to
 * stay tidy in URLs. The host can override per-call. */
export const DEFAULT_SLUG_MAX_LENGTH = 96

/**
 * Convert a human title into a URL-safe slug suitable for `slug.current`.
 *
 * Normalization contract (pinned by tests/slugify.spec.ts):
 *  - lowercase;
 *  - strip accents/diacritics (Unicode NFD decomposition, then drop the
 *    combining marks) so `Cómo … Español` → `como … espanol`;
 *  - replace every run of non-`[a-z0-9]` characters with a single `-`;
 *  - collapse repeated hyphens and trim leading/trailing hyphens;
 *  - cap at `maxLength`, then trim any hyphen the truncation left dangling.
 *
 * @param title    the source text (e.g. the post title).
 * @param maxLength maximum slug length. Defaults to {@link DEFAULT_SLUG_MAX_LENGTH}.
 * @returns the slug, or `''` when `title` has no slug-able characters.
 */
export function slugify(title: string, maxLength: number = DEFAULT_SLUG_MAX_LENGTH): string {
  const base = (title ?? '')
    .normalize('NFD')
    // Drop combining diacritical marks (U+0300–U+036F) left behind by NFD.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Any run of characters that is NOT a-z or 0-9 becomes a single hyphen.
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse any accidental repeats (defensive; the run-replace above usually
    // prevents these) and trim the ends.
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (base.length <= maxLength) return base

  // Truncate, then strip a trailing hyphen the cut may have produced so we never
  // persist a slug ending in '-'.
  return base.slice(0, maxLength).replace(/-+$/g, '')
}
