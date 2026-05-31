// Reference (server-side ONLY) implementation of `SanityWriteAdapter` (TASK-005).
//
// =====================================================================
//  SERVER-ONLY. DO NOT IMPORT INTO BROWSER / CLIENT-SHIPPABLE CODE.
// =====================================================================
// This factory takes an ALREADY-CONFIGURED write-capable `@sanity/client`. That
// client carries the write token, so anything that imports this module is, by
// definition, server-side trusted code (a serverless function, an API route,
// a build/seed script). The component itself NEVER calls this — it only ever
// calls the host-supplied `SanityWriteAdapter`. This factory exists so a host
// can stand up a compliant adapter in one line inside its own backend.
//
// The component does NOT create the write client for you (it would need the
// token to do so). The host creates it server-side, e.g.:
//
//   import { createClient } from '@sanity/client'
//   const writeClient = createClient({
//     projectId, dataset,
//     apiVersion: '2024-01-01', // pin a date; never leave unset
//     useCdn: false,            // REQUIRED for writes — the CDN is read-only
//     token: process.env.SANITY_WRITE_TOKEN, // server-side secret ONLY
//   })
//   const adapter = createReferenceWriteAdapter(writeClient)
//
// Permission reminder (sanity-writes skill §3): the supplied client's token
// must be Administrator-scoped (works on ANY plan, incl. free) or a real
// Growth-plan Editor token. A Viewer-scoped token yields
// `403 Insufficient permissions; permission "create" required`.

import type { SanityClient } from '@sanity/client'
import type {
  BlogPostInput,
  ImageMeta,
  SanityImageValue,
  SanityWriteAdapter,
} from './adapter'

/** The default document `_type` used when a post input omits `_type`. */
export const DEFAULT_POST_TYPE = 'post'

/**
 * Return the post's content fields with the `_id`/`_type` control fields
 * removed, so they are never written as document data.
 */
function stripControlFields(post: BlogPostInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const key of Object.keys(post)) {
    if (key === '_id' || key === '_type') continue
    fields[key] = post[key]
  }
  return fields
}

/**
 * Build a {@link SanityWriteAdapter} backed by an already-configured,
 * write-capable Sanity client. SERVER-SIDE ONLY (see file header).
 *
 * - `save`: creates a new post when `_id` is absent, updates the existing post
 *   when `_id` is present, and resolves with `{ _id }`.
 * - `uploadImage`: uploads the file as an image asset, then resolves with the
 *   attachable {@link SanityImageValue} reference (with any provided
 *   alt/caption/credit/size copied on).
 *
 * @param writeClient a `@sanity/client` already created with a write token,
 *   `useCdn: false`, and a pinned `apiVersion` (the host owns this; the
 *   component never sees the token).
 */
export function createReferenceWriteAdapter(writeClient: SanityClient): SanityWriteAdapter {
  return {
    async save(post: BlogPostInput): Promise<{ _id: string }> {
      const _type = post._type ?? DEFAULT_POST_TYPE

      // Strip the control fields (`_id`, `_type`) from the content payload so
      // they are never set as document data.
      const fields = stripControlFields(post)

      if (post._id) {
        // UPDATE: partial patch on the existing document, then read back the id.
        // `patch().commit()` is a no-op until `.commit()` is called.
        const result = await writeClient
          .patch(post._id)
          .set(fields)
          .commit({ autoGenerateArrayKeys: true })
        return { _id: result._id }
      }

      // CREATE: let Sanity assign the id (omit `_id`).
      const created = await writeClient.create(
        { _type, ...fields },
        { autoGenerateArrayKeys: true },
      )
      return { _id: created._id }
    },

    async uploadImage(file: File | Blob, meta?: ImageMeta): Promise<SanityImageValue> {
      // 1) Upload the binary as an image asset. Returns the ASSET DOCUMENT
      //    (with `_id`, dimensions, url, ...), NOT the attachable value.
      const filename = typeof File !== 'undefined' && file instanceof File ? file.name : undefined
      const asset = await writeClient.assets.upload('image', file, {
        ...(filename ? { filename } : {}),
        ...(file.type ? { contentType: file.type } : {}),
      })

      // 2) Build the CORRECT attach shape: a reference to the asset, never the
      //    raw asset object. Copy any provided authoring metadata onto it.
      const value: SanityImageValue = {
        _type: 'image',
        asset: { _type: 'reference', _ref: asset._id },
      }
      if (meta?.alt !== undefined) value.alt = meta.alt
      if (meta?.caption !== undefined) value.caption = meta.caption
      if (meta?.credit !== undefined) value.credit = meta.credit
      if (meta?.size !== undefined) value.size = meta.size
      return value
    },
  }
}
