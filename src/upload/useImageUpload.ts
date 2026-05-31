// User photo upload to Sanity image assets (TASK-006).
//
// =====================================================================
//  TOKEN-AGNOSTIC. The component never sees a Sanity write token.
// =====================================================================
// This composable/helper drives the user-photo upload flow on top of the
// TASK-005 write contract. It takes a host-supplied `SanityWriteAdapter` and:
//   1. validates the selected `File` CLIENT-SIDE (MIME type + size) BEFORE any
//      network call, surfacing a clear error if it is the wrong type/too big;
//   2. delegates the actual upload to `adapter.uploadImage(file, meta)`, which
//      the host routes to its server-side capability that holds the token;
//   3. maps any adapter failure (e.g. a 403 from a Viewer-scoped token) onto a
//      user-visible error rather than failing silently.
//
// It does NOT generate images (no AI image generation) and it does NOT call
// `client.assets.upload` itself — the binary leaves the browser only through the
// host adapter (sanity-writes skill §3/§4).
//
// The result is a body-ready `SanityImageValue`. Inserting it into a post body
// (with a per-item `_key`) is the orchestrator's TASK-005 scope-note item, owned
// here by {@link appendImageToBody} — the write adapter does whole-document
// replace and does NOT incrementally append a block.

import { ref, type Ref } from 'vue'
import type {
  ImageMeta,
  SanityImageValue,
  SanityWriteAdapter,
} from '../sanity/write/adapter'
import type { BlockContent, PortableTextBlock } from '../sanity/types'

/**
 * Default client-side max upload size (8 MB). Sanity's hard asset limit is
 * plan/limit sensitive and lives in the multi-MB range (sanity-writes skill §4);
 * this conservative default catches obviously-oversized originals before they
 * hit the network. Override per call/component via {@link UseImageUploadOptions}.
 */
export const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** Machine-readable reason an upload was rejected. Part of the public contract. */
export type ImageUploadErrorCode = 'invalid-type' | 'too-large' | 'upload-failed'

/**
 * A typed, user-surfaceable upload error. `code` lets a UI branch on the cause;
 * `message` is safe to show directly. `cause` carries the original adapter error
 * for logging (e.g. the raw 403).
 */
export class ImageUploadError extends Error {
  readonly code: ImageUploadErrorCode
  override readonly cause?: unknown

  constructor(code: ImageUploadErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'ImageUploadError'
    this.code = code
    this.cause = cause
    // Restore the prototype chain (TS target < ES2015 / mixed runtimes).
    Object.setPrototypeOf(this, ImageUploadError.prototype)
  }
}

/** Options controlling client-side pre-validation. */
export interface UseImageUploadOptions {
  /** Max accepted file size in bytes. Defaults to {@link DEFAULT_MAX_IMAGE_BYTES}. */
  maxBytes?: number
  /**
   * Allowed MIME types. By default any `image/*` type is accepted. Pass an
   * explicit list (e.g. `['image/jpeg', 'image/png']`) to narrow it.
   */
  accept?: string[]
}

/** The reactive surface returned by {@link useImageUpload}. */
export interface UseImageUpload {
  /**
   * Validate + upload a user-selected photo. Resolves with the body-ready
   * {@link SanityImageValue}, or rejects with an {@link ImageUploadError}. The
   * same error is also exposed reactively via {@link error}.
   */
  upload: (file: File | Blob, meta?: ImageMeta) => Promise<SanityImageValue>
  /** The most recently uploaded image value, or `null` before the first success. */
  image: Ref<SanityImageValue | null>
  /** The current error, or `null`. Cleared when a new upload starts. */
  error: Ref<ImageUploadError | null>
  /** `true` while an upload is in flight. */
  uploading: Ref<boolean>
}

/** True when `file` looks like an image we accept under `options`. */
function validate(file: File | Blob, options: Required<UseImageUploadOptions>): void {
  const type = file.type ?? ''
  const isImage = options.accept.length
    ? options.accept.includes(type)
    : type.startsWith('image/')
  if (!isImage) {
    throw new ImageUploadError(
      'invalid-type',
      `Unsupported file type "${type || 'unknown'}". Please choose an image file.`,
    )
  }
  if (file.size > options.maxBytes) {
    const mb = (options.maxBytes / (1024 * 1024)).toFixed(1)
    throw new ImageUploadError(
      'too-large',
      `Image is too large (max ${mb} MB). Please choose a smaller file.`,
    )
  }
}

/**
 * Compose a photo-upload flow over a host {@link SanityWriteAdapter}.
 *
 * @param adapter the host-supplied write adapter (never a token / client).
 * @param options client-side validation overrides.
 */
export function useImageUpload(
  adapter: SanityWriteAdapter,
  options: UseImageUploadOptions = {},
): UseImageUpload {
  const resolved: Required<UseImageUploadOptions> = {
    maxBytes: options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES,
    accept: options.accept ?? [],
  }

  const image = ref<SanityImageValue | null>(null)
  const error = ref<ImageUploadError | null>(null)
  const uploading = ref(false)

  async function upload(file: File | Blob, meta?: ImageMeta): Promise<SanityImageValue> {
    error.value = null

    // 1) Client-side pre-validation — reject BEFORE touching the adapter so a
    //    bad type / oversized file never leaves the browser (skill §4).
    try {
      validate(file, resolved)
    } catch (err) {
      const e = err as ImageUploadError
      error.value = e
      throw e
    }

    // 2) Delegate the actual upload to the host adapter. Any failure (bad token
    //    / 403, network) is mapped to a clear, user-visible error.
    uploading.value = true
    try {
      const value = await adapter.uploadImage(file, meta)
      image.value = value
      return value
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      const wrapped = new ImageUploadError(
        'upload-failed',
        `Image upload failed: ${reason}`,
        err,
      )
      error.value = wrapped
      // Do not retain a stale/partial value on failure.
      image.value = null
      throw wrapped
    } finally {
      uploading.value = false
    }
  }

  return { upload, image, error, uploading }
}

// ---------------------------------------------------------------------------
// Body insertion (the TASK-005 scope-note item).
// ---------------------------------------------------------------------------

let imageKeyCounter = 0

/**
 * Generate a unique `_key` for a PortableText array item. Sanity requires every
 * array item (PT block) to carry a stable, unique `_key`; the write adapter does
 * a whole-document replace and does NOT mint per-item keys, so the component
 * does it here. Uses `crypto.randomUUID()` when available (browser + modern
 * Node), with a monotonic counter + timestamp fallback so keys never collide.
 */
export function generateBlockKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  imageKeyCounter += 1
  return `img-${Date.now().toString(36)}-${imageKeyCounter.toString(36)}`
}

/**
 * Return a NEW body array with `imageValue` appended as an inline image block.
 *
 * The appended block is `{ _type: 'image', _key, asset, alt?, caption?, credit?,
 * size? }` — exactly the shape the TASK-003 preview renderer expects, so
 * uploaded images preview through `<BlogPostPreview>` with no extra work. The
 * input `body` is not mutated.
 *
 * @param body the existing PortableText body.
 * @param imageValue the value returned by {@link useImageUpload}/`uploadImage`.
 */
export function appendImageToBody(
  body: BlockContent,
  imageValue: SanityImageValue,
): BlockContent {
  const block: PortableTextBlock = {
    _key: generateBlockKey(),
    _type: 'image',
    asset: imageValue.asset,
  }
  if (imageValue.alt !== undefined) block.alt = imageValue.alt
  if (imageValue.caption !== undefined) block.caption = imageValue.caption
  if (imageValue.credit !== undefined) block.credit = imageValue.credit
  if (imageValue.size !== undefined) block.size = imageValue.size

  return [...body, block]
}
