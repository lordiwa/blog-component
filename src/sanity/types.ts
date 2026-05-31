// Sanity content-model types for the blog-component read path (TASK-002).
//
// These are TypeScript ports of the relevant parts of the `post`, `author`
// and `blockContent` schema types documented in blog-implementation-guide.md
// (sections 2, 4 and 5). They are intentionally minimal and self-contained so
// consumers do NOT inherit a runtime dependency on a PortableText render lib
// just to get types — the actual rendering lives in TASK-003.
//
// Every symbol exported here (re-exported from src/index.ts) is part of the
// public API surface and therefore subject to semver.

/**
 * A Sanity slug value (`{ _type: 'slug', current: 'my-post' }`).
 */
export interface SanitySlug {
  _type?: 'slug'
  current: string
}

/**
 * Reference to a Sanity image asset, plus the extra authoring fields the guide
 * attaches to inline/main images (`alt`, `caption`, `credit`, `size`).
 *
 * Section 2 / "Lo que agregamos": images carry alt/caption/credit/size.
 */
export interface SanityImage {
  _type?: 'image'
  asset: {
    _ref: string
    _type?: 'reference'
  }
  /** Hotspot/crop metadata, present when an editor adjusts the focal point. */
  hotspot?: {
    x: number
    y: number
    height: number
    width: number
  }
  crop?: {
    top: number
    bottom: number
    left: number
    right: number
  }
  alt?: string
  caption?: string
  credit?: string
  /** small (40%) / medium (70%) / full — per the guide's image schema. */
  size?: 'small' | 'medium' | 'full'
}

/**
 * A mark definition attached to a PortableText span. `internalLink` marks are
 * resolved in the DETAIL query so `slug` is populated at read time
 * (see blog-implementation-guide.md section 5 — the internalLink gotcha).
 */
export interface MarkDef {
  _key: string
  _type: string
  /** Present on `link` marks. */
  href?: string
  /** Present on `link` marks — open in a new tab. */
  blank?: boolean
  /**
   * Present on `internalLink` marks AFTER GROQ expansion. The raw stored value
   * only holds a `reference`; the DETAIL query resolves it to the target post's
   * slug string.
   */
  slug?: string
  [key: string]: unknown
}

/**
 * A single span inside a PortableText block.
 */
export interface PortableTextSpan {
  _key: string
  _type: 'span'
  text: string
  marks?: string[]
}

/**
 * A PortableText block. Standard text blocks use `_type: 'block'` with
 * `children` spans; custom body types (image, callout, gallery, embeds, ...)
 * carry their own `_type` and arbitrary fields. Kept loose on purpose — the
 * renderer (TASK-003) narrows per `_type`.
 */
export interface PortableTextBlock {
  _key: string
  _type: string
  /** Block style: 'normal' | 'h2' | 'lead' | 'pullquote' | ... */
  style?: string
  /** 'bullet' | 'number' for list items. */
  listItem?: string
  level?: number
  children?: PortableTextSpan[]
  markDefs?: MarkDef[]
  [key: string]: unknown
}

/**
 * The `blockContent` schema type: an array of PortableText blocks. This is the
 * shape of a post `body`.
 */
export type BlockContent = PortableTextBlock[]

/**
 * Expanded author, as returned by the `author->{name, image}` projection.
 */
export interface Author {
  name: string
  image?: SanityImage
}

/**
 * Lightweight post shape returned by the LIST query — no full `body`, just the
 * fields needed to render cards plus a derived `wordCount` for read-time.
 */
export interface PostListItem {
  _id: string
  title: string
  slug: SanitySlug
  publishedAt: string
  excerpt?: string
  mainImage?: SanityImage
  featured?: boolean
  /** Expanded `author->{name, image}`. May be null if no author is set. */
  author: Author | null
  /**
   * Character count of the flattened body text (`length(pt::text(body))`),
   * coalesced to 0 when the body is absent. This is a CHARACTER count, not a
   * word count: consumers approximating read time should divide by ~1100
   * (roughly 200 words/min at ~5.5 chars/word).
   */
  bodyCharCount: number
}

/**
 * Full post shape returned by the DETAIL query, including the expanded `body`
 * (with resolved `internalLink` slugs) and the expanded author.
 */
export interface Post {
  _id: string
  title: string
  slug: SanitySlug
  publishedAt: string
  updatedAt?: string
  excerpt?: string
  mainImage?: SanityImage
  featured?: boolean
  /** Expanded `author->{name, image}`. May be null if no author is set. */
  author: Author | null
  /** Full PortableText body with `internalLink` markDefs resolved to slugs. */
  body: BlockContent
}
