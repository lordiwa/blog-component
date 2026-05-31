// GROQ queries for the blog-component read path (TASK-002).
//
// Mirrors the patterns in blog-implementation-guide.md:
//  - section 4: separate LIST vs DETAIL queries; never pull the full `body`
//    in the listing; filter `defined(publishedAt) && publishedAt <= now()` so
//    future-dated posts stay invisible (scheduling for free); order
//    `featured desc, publishedAt desc`; derive `bodyCharCount` from
//    `pt::text(body)`.
//  - section 5: the `internalLink` gotcha — the mark only stores a reference,
//    so the DETAIL query must expand it to the target slug at read time.

/**
 * LIST query — lightweight projection for cards. Deliberately omits `body`
 * (expensive) and only computes `bodyCharCount` from it for read-time estimates.
 */
export const POST_LIST_QUERY = `*[_type == "post" && defined(publishedAt) && publishedAt <= now()]
  | order(featured desc, publishedAt desc) {
    _id,
    title,
    slug,
    publishedAt,
    excerpt,
    mainImage,
    featured,
    "author": author->{name, image},
    "bodyCharCount": coalesce(length(pt::text(body)), 0)
  }`

// Shared DETAIL projection (TASK-010). Used by both the airtight and preview
// by-slug queries so they never drift. Notes:
//  - AC3 null-tolerant body: `coalesce(body[]{ ... }, [])` so an absent body
//    yields `[]` (never null) — `Post.body` stays a non-null `BlockContent`.
//  - section 5 internalLink gotcha: expand the stored reference to the target
//    post's current slug at read time.
const DETAIL_PROJECTION = `{
    _id,
    title,
    slug,
    publishedAt,
    updatedAt,
    excerpt,
    mainImage,
    featured,
    "author": author->{name, image},
    "body": coalesce(body[]{
      ...,
      markDefs[]{
        ...,
        _type == "internalLink" => {
          "slug": @.reference->slug.current
        }
      }
    }, [])
  }`

/**
 * DETAIL query — full post by slug, AIRTIGHT (default). Mirrors the LIST query's
 * publish filter (`defined(publishedAt) && publishedAt <= now()`) so a
 * future-dated/scheduled post is NOT reachable by slug by default. Expands the
 * author, coalesces an absent body to `[]`, and resolves `internalLink` markDefs
 * to slugs. Takes a `$slug` parameter.
 *
 * For the preview/draft escape hatch that DOES reach scheduled posts, see
 * {@link POST_BY_SLUG_PREVIEW_QUERY}.
 */
export const POST_BY_SLUG_QUERY = `*[_type == "post" && slug.current == $slug && defined(publishedAt) && publishedAt <= now()][0]${DETAIL_PROJECTION}`

/**
 * DETAIL query — full post by slug, PREVIEW variant. Identical projection to
 * {@link POST_BY_SLUG_QUERY} but WITHOUT the publish filter, so a direct slug
 * lookup reaches scheduled/future-dated posts. Use only for trusted preview
 * surfaces (e.g. an editor previewing an unpublished draft). Takes `$slug`.
 */
export const POST_BY_SLUG_PREVIEW_QUERY = `*[_type == "post" && slug.current == $slug][0]${DETAIL_PROJECTION}`
