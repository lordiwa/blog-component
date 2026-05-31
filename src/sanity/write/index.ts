// Barrel for the blog-component Sanity WRITE path (TASK-005).
//
// The component is token-agnostic: it depends on the `SanityWriteAdapter`
// contract, never on a write token. The host supplies the adapter; the optional
// `createReferenceWriteAdapter` factory is a SERVER-ONLY convenience for hosts
// that want a ready-made implementation over their own write client.

export type {
  SanityWriteAdapter,
  BlogPostInput,
  ImageMeta,
  SanityImageValue,
} from './adapter'

export {
  createReferenceWriteAdapter,
  DEFAULT_POST_TYPE,
} from './reference-adapter'

// Pure, token-free slug helper (TASK-011). Safe in any environment — the host's
// server-side `save` uses it to mint `slug.current` on create so the read path
// can find new posts.
export {
  slugify,
  DEFAULT_SLUG_MAX_LENGTH,
} from './slugify'

// Pure, token-free publish defaults (TASK-011). On CREATE, derives `slug` from
// the title and stamps `publishedAt = now` so a new post is visible to the
// TASK-002 read queries; never touches an UPDATE or host-supplied values.
export {
  withPublishDefaults,
  type PublishDefaultsOptions,
} from './publish'
