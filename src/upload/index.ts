// Barrel for the user photo upload path (TASK-006).
//
// The component is token-agnostic: the upload flow depends only on the
// `SanityWriteAdapter` contract from TASK-005 (the host injects the adapter that
// holds the write token server-side). It uploads a USER-supplied photo (no AI
// image generation) and appends it into a PortableText body with a unique
// per-item `_key`, ready to preview through `<BlogPostPreview>` (TASK-003).
//
// Re-exported from the package entry (src/index.ts).

export { default as ImageUploader } from './ImageUploader.vue'

export {
  useImageUpload,
  appendImageToBody,
  generateBlockKey,
  ImageUploadError,
  DEFAULT_MAX_IMAGE_BYTES,
} from './useImageUpload'

export type {
  UseImageUpload,
  UseImageUploadOptions,
  ImageUploadErrorCode,
} from './useImageUpload'
