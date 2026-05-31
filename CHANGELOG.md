# Changelog

All notable changes to `blog-component` are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Semver policy

**Every symbol exported from the package entry (`src/index.ts`) is public API.**
A breaking change to ANY export — removing it, renaming it, changing a function
signature or a component's props/events, or narrowing an exported type — is a
**major** version bump. Backward-compatible additions are **minor**; fixes that
don't change the contract are **patch**. `DEFAULT_*` constants are part of the
contract: changing a default value is at least a minor (potentially major if it
alters behavior consumers rely on).

## [Unreleased]

### Read-path robustness (TASK-010) — additive (semver-minor)

- **Added** `BlogReadError` + `isBlogReadError` (and type `BlogReadOperation`):
  the read helpers now normalize any `client.fetch` rejection into this typed
  error (original preserved as `cause`, with `operation`/`slug`) instead of
  leaking raw SDK errors.
- **Added** `POST_BY_SLUG_PREVIEW_QUERY` and the `getPostBySlug(client, slug,
  options?)` `{ allowUnpublished }` option (type `GetPostBySlugOptions`).
- **Behavioral change:** `getPostBySlug` is now **airtight by default** — it
  applies `defined(publishedAt) && publishedAt <= now()`, so scheduled/future
  posts are no longer reachable by slug unless `allowUnpublished: true`. This is
  the only behavior change; consumers relying on by-slug reaching unpublished
  posts must opt in.
- `POST_BY_SLUG_QUERY` (and the preview variant) now coalesce an absent `body`
  to `[]`, so `Post.body` is guaranteed non-null.

---

First public surface (0.0.1). The exported public API, grouped by area
(see `src/index.ts`):

### Read path

- `createBlogClient`, `DEFAULT_DATASET`, `DEFAULT_API_VERSION`, type
  `BlogSanityConfig` — configurable `@sanity/client` factory.
- `getPostList`, `getPostBySlug` (option type `GetPostBySlugOptions`) — typed
  read helpers.
- `POST_LIST_QUERY`, `POST_BY_SLUG_QUERY`, `POST_BY_SLUG_PREVIEW_QUERY` — the
  GROQ queries.
- `BlogReadError`, `isBlogReadError`, type `BlogReadOperation` — normalized
  consumer-facing read errors.
- Content-model types: `Post`, `PostListItem`, `Author`, `BlockContent`,
  `PortableTextBlock`, `PortableTextSpan`, `MarkDef`, `SanityImage`, `SanitySlug`.

### Render / preview

- `BlogPostPreview` — PortableText renderer component.
- `createPortableComponents`, `CUSTOM_BODY_TYPES`, `CUSTOM_BLOCK_STYLES`,
  `CUSTOM_MARKS`, `DELEGATED_DECORATOR_MARKS`.
- Types: `ImageUrlBuilder`, `PortableComponentsOptions`, `CustomBodyType`,
  `CustomBlockStyle`, `CustomMark`, `DelegatedDecoratorMark`.

### AI authoring

- `generatePostBody`, `DEFAULT_AI_MODEL` (`claude-sonnet-4-6`).
- Types: `GeneratePostOptions`, `GeneratedPost`.

### Write path

- `createReferenceWriteAdapter` (SERVER-ONLY), `DEFAULT_POST_TYPE`.
- `slugify`, `DEFAULT_SLUG_MAX_LENGTH`.
- `withPublishDefaults`, type `PublishDefaultsOptions` — derive `slug` +
  `publishedAt` on CREATE so a new post is visible to the read queries; never
  overwrites existing/host-supplied values.
- Types: `SanityWriteAdapter`, `BlogPostInput`, `ImageMeta`, `SanityImageValue`.

### Image upload

- `ImageUploader`, `useImageUpload`, `appendImageToBody`, `generateBlockKey`,
  `ImageUploadError`, `DEFAULT_MAX_IMAGE_BYTES` (8 MB).
- Types: `UseImageUpload`, `UseImageUploadOptions`, `ImageUploadErrorCode`.

### Authoring component

- `BlogAuthor` — the headline brief → draft → edit → upload → preview → save
  component. Props: `adapter`, `generate`, `aiOptions`, `projectId`, `dataset`,
  `imageUrlBuilder`, `validation`, `initialPost`, `postType`, `autoPublish`
  (default `true`). Events: `saved`, `change`, `error`.

### Other

- `BlogPlaceholder` — early scaffold component (retained; not needed for real
  use).

### Tooling

- Vite library-mode build: `dist/blog-component.js` (ESM), `dist/index.d.ts`
  (rolled-up declarations), `dist/blog-component.css`.
- CI (`.github/workflows/ci.yml`): lint, typecheck (build + tests), unit tests,
  build — on push and pull request (Node 20).
- `tsconfig.test.json` + `npm run typecheck:test` type-check the spec files (the
  build config excludes `tests/`).
