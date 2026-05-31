// Sanity WRITE contract for the blog-component (TASK-005).
//
// =====================================================================
//  SECURITY MODEL — read this before touching anything in this folder.
// =====================================================================
// The component is **token-agnostic**: it never imports, stores, or sees a
// Sanity write token. Writes (creating/updating a post, uploading an image
// asset) require an *elevated* token, and shipping such a token in client JS
// would let anyone read the bundle / network tab and gain project-wide write
// access. So the token lives ONLY server-side.
//
// Instead, the host supplies a `SanityWriteAdapter`. The component calls
// `adapter.save(post)` / `adapter.uploadImage(file, meta)`; the adapter routes
// those calls to a server-side capability that holds the token.
//
// Default / recommended integration:
//   The host implements the adapter as a thin client over its own tiny
//   server-side signing/proxy endpoint (e.g. a serverless function). That
//   endpoint holds the write token and performs the actual Sanity mutation.
//   See `createReferenceWriteAdapter` for a reference implementation that runs
//   *server-side only* (it takes an already-configured write client).
//
// Token / permission facts (from the sanity-writes skill, §3):
//   - An **Administrator-scoped** token can `create`/`update` on ANY plan,
//     including the FREE plan. It is maximally privileged, so it must never
//     leave the server.
//   - A real, least-privilege human **Editor** role requires the Growth plan;
//     it is NOT a hard requirement for programmatic writes — an Admin token on
//     the free plan is the pragmatic default.
//   - A **Viewer-scoped** token can NEVER write: every mutation returns
//     `403 Insufficient permissions; permission "create" required`. This is the
//     exact failure the original treparole-website seed script hit.
//
// Every symbol exported from this folder is part of the published API surface
// and therefore subject to semver.

import type { SanityImage } from '../types'

/**
 * The value persisted for an uploaded image: a Sanity `image` object holding a
 * reference to the uploaded asset, plus the authoring fields this project's
 * schema attaches (`alt`/`caption`/`credit`/`size`).
 *
 * This is the WRITE-SIDE shape (what `uploadImage` returns and what you attach
 * to a document). It is intentionally compatible with the read-side
 * {@link SanityImage} type: both describe `{ _type: 'image', asset: { _type:
 * 'reference', _ref } }` with the same optional fields.
 *
 * NOTE the correct attach shape — it must be a reference to the asset, never
 * the raw asset document:
 * `{ _type: 'image', asset: { _type: 'reference', _ref: asset._id }, ... }`.
 */
export interface SanityImageValue {
  _type: 'image'
  asset: {
    _type: 'reference'
    /** The uploaded asset document id, e.g. `image-abc123-2000x1500-jpg`. */
    _ref: string
  }
  alt?: string
  caption?: string
  credit?: string
  /** small (40%) / medium (70%) / full — per the guide's image schema. */
  size?: SanityImage['size']
}

/**
 * Optional metadata captured for a user-uploaded photo. All fields are
 * optional; whatever is provided is copied onto the returned
 * {@link SanityImageValue}.
 */
export interface ImageMeta {
  alt?: string
  caption?: string
  credit?: string
  size?: SanityImageValue['size']
}

/**
 * The post payload the component hands to {@link SanityWriteAdapter.save}.
 *
 * - Omit `_id` to CREATE a new post (Sanity assigns the id).
 * - Provide an existing `_id` to UPDATE that post (round-trips create→read or
 *   update→read; see the reference adapter).
 *
 * `_type` defaults to `'post'` in the reference adapter when omitted. All other
 * fields are the post content (title, slug, body, mainImage, ...). Kept loose
 * on purpose so it tracks the schema without churn: the schema (and thus the
 * accepted fields) is owned by the consuming Sanity project, not this library.
 */
export interface BlogPostInput {
  /** Present => update that document; absent => create a new one. */
  _id?: string
  /** Document type. Defaults to `'post'` in the reference adapter. */
  _type?: string
  [field: string]: unknown
}

/**
 * The host-implemented write contract the component depends on. The component
 * NEVER constructs a write client itself — it only ever calls these methods.
 *
 * Back this with whichever option the consuming project prefers:
 *   (a) a self-hosted signing/proxy endpoint holding an Admin token (default,
 *       most secure — the token never reaches the browser), or
 *   (b) a host-injected token used by `createReferenceWriteAdapter` on the
 *       server, or
 *   (c) a Growth-plan Editor role with per-user tokens.
 * All three are drop-in implementations of this same interface.
 */
export interface SanityWriteAdapter {
  /**
   * Persist a post and resolve with the saved document id. Create when
   * `post._id` is absent, update when present.
   */
  save(post: BlogPostInput): Promise<{ _id: string }>
  /**
   * Upload a user photo as a Sanity image asset and resolve with the
   * attachable {@link SanityImageValue} reference (NOT the raw asset document).
   */
  uploadImage(file: File | Blob, meta?: ImageMeta): Promise<SanityImageValue>
}
