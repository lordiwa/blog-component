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

/**
 * DETAIL query — full post by slug. Expands the author and resolves
 * `internalLink` markDefs to the referenced post's current slug, per the
 * guide's section 5 gotcha. Takes a `$slug` parameter.
 */
export const POST_BY_SLUG_QUERY = `*[_type == "post" && slug.current == $slug][0]{
    _id,
    title,
    slug,
    publishedAt,
    updatedAt,
    excerpt,
    mainImage,
    featured,
    "author": author->{name, image},
    body[]{
      ...,
      markDefs[]{
        ...,
        _type == "internalLink" => {
          "slug": @.reference->slug.current
        }
      }
    }
  }`
