// Public entry point for the blog-component package.
// Every export here is part of the published API surface.
export { default as BlogPlaceholder } from './components/BlogPlaceholder.vue'

// --- Sanity read path (TASK-002) -------------------------------------------
// Configurable client factory + typed read functions.
export {
  createBlogClient,
  DEFAULT_DATASET,
  DEFAULT_API_VERSION,
  type BlogSanityConfig,
} from './sanity/client'
export { getPostList, getPostBySlug, type GetPostBySlugOptions } from './sanity/posts'
export {
  POST_LIST_QUERY,
  POST_BY_SLUG_QUERY,
  POST_BY_SLUG_PREVIEW_QUERY,
} from './sanity/queries'
// TASK-010: normalized, consumer-facing read error (raw SDK errors are wrapped).
export {
  BlogReadError,
  isBlogReadError,
  type BlogReadOperation,
} from './sanity/read-error'

// Public content-model types.
export type {
  Post,
  PostListItem,
  Author,
  BlockContent,
  PortableTextBlock,
  PortableTextSpan,
  MarkDef,
  SanityImage,
  SanitySlug,
} from './sanity/types'

// --- PortableText render / preview (TASK-003) ------------------------------
export {
  BlogPostPreview,
  createPortableComponents,
  CUSTOM_BODY_TYPES,
  CUSTOM_BLOCK_STYLES,
  CUSTOM_MARKS,
  DELEGATED_DECORATOR_MARKS,
  type ImageUrlBuilder,
  type PortableComponentsOptions,
  type CustomBodyType,
  type CustomBlockStyle,
  type CustomMark,
  type DelegatedDecoratorMark,
} from './render'

// --- AI authoring path (TASK-004) ------------------------------------------
// Key-agnostic: host injects a configured Anthropic client or apiKey (server-side).
export {
  generatePostBody,
  DEFAULT_AI_MODEL,
  type GeneratePostOptions,
  type GeneratedPost,
} from './ai/generatePostBody'

// --- Sanity write path (TASK-005) ------------------------------------------
// Token-agnostic write contract + optional SERVER-ONLY reference adapter.
export {
  createReferenceWriteAdapter,
  DEFAULT_POST_TYPE,
} from './sanity/write'
// TASK-011: URL-safe slug helper + publish defaults (pure, token-free) for the
// create path. `withPublishDefaults` derives slug + publishedAt on CREATE so a
// new post is visible to the read queries; never overwrites existing values.
export {
  slugify,
  DEFAULT_SLUG_MAX_LENGTH,
  withPublishDefaults,
  type PublishDefaultsOptions,
} from './sanity/write'
export type {
  SanityWriteAdapter,
  BlogPostInput,
  ImageMeta,
  SanityImageValue,
} from './sanity/write'

// --- Image upload (TASK-006) -----------------------------------------------
// User-supplied photo upload over the token-agnostic write adapter. The upload
// component + composable validate client-side, delegate the upload to the host
// adapter, and append the result into a PortableText body with a unique `_key`
// (preview via BlogPostPreview). No AI image generation.
export {
  ImageUploader,
  useImageUpload,
  appendImageToBody,
  generateBlockKey,
  ImageUploadError,
  DEFAULT_MAX_IMAGE_BYTES,
} from './upload'
export type {
  UseImageUpload,
  UseImageUploadOptions,
  ImageUploadErrorCode,
} from './upload'

// --- Authoring (TASK-007) --------------------------------------------------
// The headline public component. `<BlogAuthor>` composes the AI draft
// (TASK-004), live preview (TASK-003), photo upload (TASK-006), and Sanity
// write (TASK-005) paths into one brief -> draft -> edit -> upload -> preview ->
// save flow. SECRETS STAY OUT: the host injects the `SanityWriteAdapter` (used
// for BOTH save and image upload) and an AI `generate` hook run server-side
// (recommended) or server-side `aiOptions`; the component never holds a Sanity
// write token or an Anthropic key. A full WYSIWYG block-level editor is out of
// scope — "edit" = title/excerpt + (re)generate body + append/remove images.
export { BlogAuthor } from './authoring'
