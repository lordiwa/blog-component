# Required Sanity content model

`blog-component` does **not** hardcode or ship a Sanity schema — the consuming
project owns its Studio. This document describes the content model the library's
read queries and write/publish path depend on, so you can add equivalent types to
your own Studio.

**Copy-paste source:** working schema files live in
[`../studio/schemaTypes/`](../studio/schemaTypes/) — `post.js`, `author.js`,
`category.js`, `blockContent.js`, `callout.js`, `gallery.js`, plus `index.js`
that registers them. Drop them into your Studio's `schemaTypes/` (see
[`../studio/README.md`](../studio/README.md)). The minimum the library needs is
`post`, `author`, and `blockContent`; `category`, `callout`, and `gallery` are
optional extras the example schema also renders.

The TypeScript shapes the library returns are in
[`../src/sanity/types.ts`](../src/sanity/types.ts) (`Post`, `PostListItem`,
`Author`, `BlockContent`, `SanityImage`, `SanitySlug`), re-exported from the
package entry.

---

## `post` document

| Field | Type | Required | Used by | Notes |
| --- | --- | --- | --- | --- |
| `title` | `string` | yes | list + detail; publish (`slug` derived from it) | 5–140 chars in the example schema. |
| `slug` | `slug` (`{ _type:'slug', current }`) | yes | **`POST_BY_SLUG_QUERY` matches `slug.current`** | On CREATE `<BlogAuthor>` derives it from `title` (see [publish path](#publish-path)). |
| `publishedAt` | `datetime` (ISO string) | yes | **`POST_LIST_QUERY` requires `defined(publishedAt) && publishedAt <= now()`** | On CREATE `<BlogAuthor>` stamps `now`. Future-dated posts are hidden (scheduling). |
| `author` | `reference` → `author` | yes (example schema) | both queries project `author->{name, image}` | May read back `null` if unset. |
| `mainImage` | `image` (`alt`, `credit`) | no | both queries | Card / hero image. |
| `excerpt` | `text` | no | both queries | Card + meta description. |
| `body` | `blockContent` | no | detail query (full body); list derives `bodyCharCount` via `pt::text(body)` | The PortableText array `<BlogPostPreview>` renders. |
| `featured` | `boolean` | no | list ordering (`featured desc, publishedAt desc`) | |
| `updatedAt` | `datetime` | no | detail query | Optional "last edited". |

The example `post.js` also defines `subtitle`, `coAuthors`, `categories`, `tags`,
`seoTitle`, `seoDescription`, `openGraphImage`, `sources`, and `internalNotes`.
These are **not** required by the library — keep or drop them freely.

### Fields the read queries depend on

- **`POST_LIST_QUERY`** (`getPostList`): filters `_type == "post" &&
  defined(publishedAt) && publishedAt <= now()`, orders by `featured desc,
  publishedAt desc`, and projects `_id, title, slug, publishedAt, excerpt,
  mainImage, featured, author->{name, image}` plus `bodyCharCount`. A post with no
  `publishedAt` (or a future one) never appears.
- **`POST_BY_SLUG_QUERY`** (`getPostBySlug`): matches `_type == "post" &&
  slug.current == $slug`, takes `[0]`, and resolves `internalLink` markDefs to the
  target post's `slug.current`. A post with no `slug.current` is unfetchable by
  slug.

### Publish path

On CREATE (no `_id`), `<BlogAuthor>` with `autoPublish` (default `true`) runs the
post through `withPublishDefaults`, which:

- sets `slug = { _type:'slug', current: slugify(title) }` when `slug.current` is
  absent/empty and the title slugifies to something, and
- sets `publishedAt = now` when it is absent/empty/whitespace.

Host-supplied non-empty values are preserved; UPDATEs (with `_id`) are untouched.
`slugify` is deterministic and **not** uniqueness-checked — same title ⇒ same
slug; uniqueness is the host's responsibility. See the README
[Publishing semantics](../README.md#publishing-semantics-slug--publishedat).

---

## `author` document

| Field | Type | Used by | Notes |
| --- | --- | --- | --- |
| `name` | `string` | `author->{name}` projection | Shown on cards/detail. |
| `image` | `image` (hotspot) | `author->{image}` projection | Optional avatar. |
| `slug` | `slug` | — | In the example schema; not required by the library. |
| `bio` | `array` of blocks | — | Optional. |

The library only reads `name` and `image` from a referenced author.

---

## `blockContent` array type (post `body`)

`body` is a PortableText array. Its members must include:

### Standard text block (`type: 'block'`)

- **Styles** (example schema): `normal`, `h1`, `h2`, `h3`, `h4`, `lead`,
  `blockquote`, `pullquote`. The renderer custom-styles `lead` and `pullquote`
  (`CUSTOM_BLOCK_STYLES`); headings/normal/blockquote use built-ins.
- **Lists:** `bullet`, `number`.
- **Decorators (marks):** `strong`, `em`, `underline`, `strike-through`,
  `highlight`, `code`. The renderer custom-renders `underline` and `highlight`
  (`CUSTOM_MARKS`); `strike`/`code` are delegated to the default renderer
  (`DELEGATED_DECORATOR_MARKS`).
- **Annotations (link marks):**
  - `link` — external URL: `{ href, blank }`.
  - `internalLink` — `{ reference -> post }`. The detail query resolves this to
    the target post's `slug.current` at read time so the renderer can build an
    in-app href.

### Image member (`type: 'image'`)

The inline image block the upload path produces and the renderer displays. Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `asset` | `reference` → image asset | `{ _type:'reference', _ref }` — produced by `uploadImage`. |
| `alt` | `string` | Accessibility / SEO. |
| `caption` | `string` | Shown under the image. |
| `credit` | `string` | Source / attribution. |
| `size` | `string` | `small` (40%), `medium` (70%), `full` (100%). |

This matches `SanityImageValue` (what `SanityWriteAdapter.uploadImage` returns and
`appendImageToBody` inserts) and `SanityImage` (the read-side type). The renderer
uses `size` to pick an image width and reads `alt`/`caption`/`credit`.

### Other members (optional)

The example `blockContent.js` also defines `callout`, `gallery`, `divider`,
`ctaButton`, `youtubeEmbed`, `vimeoEmbed`, `tweetEmbed`, and `iframeEmbed`. These
are project extras — the library renders the ones it knows and shows a visible
placeholder for any block type without a renderer (no silent failures). Add only
what you need.
