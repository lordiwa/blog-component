# blog-component

Reusable **Vue 3 + TypeScript** component library for **AI-assisted blog
authoring** on top of [Sanity](https://www.sanity.io). It composes a Claude-drafted
PortableText body, a live preview, user image uploads, and a Sanity write path
into one `<BlogAuthor>` component — plus standalone read helpers and a
`<BlogPostPreview>` renderer for the public-facing side.

The library is **token-agnostic and key-agnostic by design**: it never holds a
Sanity write token or an Anthropic API key. The host injects those capabilities
behind small contracts (`SanityWriteAdapter` for writes, a `generate` hook for
AI) so secrets stay server-side. See [Secure write path](#secure-write-path-ac-4)
and [Secure AI hook](#secure-ai-hook).

Built in Vite library mode: an ESM bundle + rolled-up `.d.ts`. `vue` is a peer
dependency; the Sanity/Anthropic SDKs are runtime dependencies kept external
(installed transitively, not bundled).

## Contents

- [Overview](#overview)
- [Install (from GitHub)](#install-from-github)
- [Read path](#read-path)
- [CORS Origins (the silent prod blocker)](#cors-origins-the-silent-prod-blocker)
- [Authoring with `<BlogAuthor>`](#authoring-with-blogauthor)
- [Secure write path (AC 4)](#secure-write-path-ac-4)
- [Secure AI hook](#secure-ai-hook)
- [Publishing semantics (slug + publishedAt)](#publishing-semantics-slug--publishedat)
- [Image upload](#image-upload)
- [Required Sanity schema](#required-sanity-schema)
- [Running the in-repo example](#running-the-in-repo-example)
- [Scripts](#scripts)
- [Build output](#build-output)

## Overview

`blog-component` exports (all from the package entry `blog-component`):

| Area | Exports |
| --- | --- |
| Read client | `createBlogClient`, `DEFAULT_DATASET`, `DEFAULT_API_VERSION`, type `BlogSanityConfig` |
| Read queries | `getPostList`, `getPostBySlug`, `POST_LIST_QUERY`, `POST_BY_SLUG_QUERY`, `POST_BY_SLUG_PREVIEW_QUERY`, type `GetPostBySlugOptions` |
| Read errors | `BlogReadError`, `isBlogReadError`, type `BlogReadOperation` |
| Content types | `Post`, `PostListItem`, `Author`, `BlockContent`, `PortableTextBlock`, `PortableTextSpan`, `MarkDef`, `SanityImage`, `SanitySlug` |
| Preview / render | `BlogPostPreview`, `createPortableComponents`, `CUSTOM_BODY_TYPES`, `CUSTOM_BLOCK_STYLES`, `CUSTOM_MARKS`, `DELEGATED_DECORATOR_MARKS`, types `ImageUrlBuilder`, `PortableComponentsOptions`, `CustomBodyType`, `CustomBlockStyle`, `CustomMark`, `DelegatedDecoratorMark` |
| AI authoring | `generatePostBody`, `DEFAULT_AI_MODEL`, types `GeneratePostOptions`, `GeneratedPost` |
| Write path | `createReferenceWriteAdapter`, `DEFAULT_POST_TYPE`, types `SanityWriteAdapter`, `BlogPostInput`, `ImageMeta`, `SanityImageValue` |
| Publish helpers | `slugify`, `DEFAULT_SLUG_MAX_LENGTH`, `withPublishDefaults`, type `PublishDefaultsOptions` |
| Image upload | `ImageUploader`, `useImageUpload`, `appendImageToBody`, `generateBlockKey`, `ImageUploadError`, `DEFAULT_MAX_IMAGE_BYTES`, types `UseImageUpload`, `UseImageUploadOptions`, `ImageUploadErrorCode` |
| Authoring component | `BlogAuthor` |
| Placeholder | `BlogPlaceholder` (early scaffold; not needed for real use) |

## Install (from GitHub)

```sh
npm install github:<your-user>/blog-component
# or pin a tag/commit
npm install github:<your-user>/blog-component#v0.0.1
```

`vue@^3.4.0` is a **peer dependency** — the consuming app provides it.

On a GitHub install npm runs the `prepare` script, which builds `dist/` (the
`dist/` folder is not committed). The package's `exports`/`types`/`files` then
resolve to the freshly built ESM bundle and `.d.ts`.

These are **runtime dependencies** of the package. They are left external in the
library build (not bundled), so they install transitively when you install
`blog-component` — a single deduped copy in your app is recommended:

- `@sanity/client` — read client + (server-side) write client
- `@portabletext/vue` — PortableText renderer used by `<BlogPostPreview>`
- `@sanity/image-url` — CDN image URL builder for the preview
- `@anthropic-ai/sdk` — Claude SDK used by `generatePostBody` (server-side)

### CSS

The components ship a stylesheet. Import it once in your app entry:

```ts
import 'blog-component/style.css'
```

## Read path

Create a client with **your own** Sanity config (nothing is hardcoded), then use
the typed read helpers:

```ts
import { createBlogClient, getPostList, getPostBySlug } from 'blog-component'
import type { Post, PostListItem } from 'blog-component'

const client = createBlogClient({
  projectId: import.meta.env.VITE_SANITY_PROJECT_ID, // required
  dataset: 'production',      // optional, defaults to 'production' (DEFAULT_DATASET)
  apiVersion: '2024-01-01',   // optional, pinned default (DEFAULT_API_VERSION)
  // useCdn defaults to true (fast cacheable reads); token optional for private datasets
})

const posts: PostListItem[] = await getPostList(client)
const post: Post | null = await getPostBySlug(client, 'my-post-slug')
```

- `getPostList` returns lightweight cards (no full `body`, plus a `bodyCharCount`
  — the character count of the flattened body text, not a word count; divide by
  ~1100 for a ~200 wpm read-time estimate), ordered `featured desc, publishedAt
  desc`, and excludes future-dated posts (`publishedAt <= now()`).
- `getPostBySlug` returns the full post with the author expanded, `internalLink`
  marks resolved to the target post's slug, and an absent `body` coalesced to `[]`
  (so `Post.body` is always a non-null array).

#### Scheduling (by-slug is airtight by default)

`getPostBySlug` is **airtight by default**: it applies the same
`defined(publishedAt) && publishedAt <= now()` filter as the list query, so a
future-dated/scheduled post is **not reachable by slug**. For trusted preview
surfaces (e.g. an editor previewing an unpublished draft), pass
`allowUnpublished: true` to reach scheduled posts by direct slug:

```ts
// Reaches a scheduled / future-dated post by slug (preview only).
const draft = await getPostBySlug(client, 'my-post-slug', { allowUnpublished: true })
```

The two underlying queries are exported: `POST_BY_SLUG_QUERY` (airtight) and
`POST_BY_SLUG_PREVIEW_QUERY` (unfiltered).

#### Errors

Both read helpers normalize any underlying `client.fetch` rejection (CORS, 401/403,
bad GROQ, transport errors) into a typed **`BlogReadError`** rather than leaking
raw SDK errors. It carries `operation` (`'getPostList' | 'getPostBySlug'`), `slug`
(for by-slug), and the original error as `cause`:

```ts
import { getPostBySlug, BlogReadError, isBlogReadError } from 'blog-component'

try {
  await getPostBySlug(client, 'my-post-slug')
} catch (err) {
  if (isBlogReadError(err)) {
    console.error(err.operation, err.slug, err.cause) // original preserved
  }
}
```

### Rendering a post body

`<BlogPostPreview>` renders a PortableText `body`. Give it either a `projectId`
(+ optional `dataset`) so it builds an image URL builder internally, or a
pre-built `imageUrlBuilder` (from `@sanity/image-url`'s `createImageUrlBuilder`):

```vue
<script setup lang="ts">
import { createImageUrlBuilder } from '@sanity/image-url'
import { createBlogClient, BlogPostPreview } from 'blog-component'
import type { Post } from 'blog-component'

const props = defineProps<{ post: Post }>()
const client = createBlogClient({ projectId: 'yourProjectId', dataset: 'production' })
const imageUrlBuilder = createImageUrlBuilder(client)
</script>

<template>
  <article>
    <h1>{{ post.title }}</h1>
    <BlogPostPreview :body="post.body" :image-url-builder="imageUrlBuilder" />
    <!-- or simply: <BlogPostPreview :body="post.body" project-id="yourProjectId" /> -->
  </article>
</template>
```

## CORS Origins (the silent prod blocker)

Browser reads (and writes) against a **real** dataset only succeed when the
calling origin is registered in the Sanity project's CORS Origins. A missing
origin fails **silently in the network tab** — this is the most common
"it works locally but not in prod" trap, so do it up front.

1. In <https://sanity.io/manage> open your project → **API → CORS Origins**, or
   use the CLI:

   ```sh
   npx sanity cors add http://localhost:5173 --credentials
   ```

2. Add **every** origin that will call Sanity from the browser, with credentials:
   - your app origin(s) — dev (`http://localhost:5173`) and each deployed domain;
   - if you also run a **Sanity Studio**, its origin too (`http://localhost:3333`
     for a local Studio, and the `*.sanity.studio` deploy URL).

3. With a valid `projectId` (public dataset, or a read `token` for a private one),
   call `getPostList(client)` and confirm posts load with no CORS error.

## Authoring with `<BlogAuthor>`

`<BlogAuthor>` is the headline component: it runs the full
**brief → AI draft → edit title/excerpt → upload images → live preview → save**
flow. It composes `generatePostBody` (AI), `<BlogPostPreview>` (preview),
`<ImageUploader>` (upload), and `adapter.save` (write) — secrets stay out (the
host injects the adapter and the AI hook).

### Props (verified against `src/authoring/BlogAuthor.vue`)

| Prop | Type | Notes |
| --- | --- | --- |
| `adapter` (required) | `SanityWriteAdapter` | Host write contract; used for BOTH `save` and image upload. |
| `generate` | `(brief: string) => Promise<GeneratedPost>` | RECOMMENDED secure AI hook (runs server-side). When set, `aiOptions` is ignored. |
| `aiOptions` | `GeneratePostOptions` | SERVER-SIDE-ONLY fallback passed straight to `generatePostBody`. Do not embed an Anthropic key in client JS. |
| `projectId` | `string` | For the preview's image URLs (required unless `imageUrlBuilder` is given). |
| `dataset` | `string` | Defaults to `production` when `projectId` is used. |
| `imageUrlBuilder` | `ImageUrlBuilder` | Pre-built `@sanity/image-url` builder; overrides `projectId`/`dataset`. |
| `validation` | `UseImageUploadOptions` | Client-side upload limits (`maxBytes`, `accept`). |
| `initialPost` | `Partial<Post>` | Seed for editing an existing post (its `_id`/`slug`/etc. round-trip). |
| `postType` | `string` | Saved document `_type`. Defaults to `DEFAULT_POST_TYPE` (`'post'`). |
| `autoPublish` | `boolean` | Defaults to `true`. On CREATE, auto-derives `slug` + `publishedAt`. See [Publishing semantics](#publishing-semantics-slug--publishedat). |

### Events

| Event | Payload | When |
| --- | --- | --- |
| `saved` | `{ _id: string }` | After a successful `adapter.save`. |
| `change` | `BlogPostInput` | On any generate / edit / upload (emits the raw working post). |
| `error` | `string` | User-visible message on a generate / upload / save failure. |

### Minimal mount

```vue
<script setup lang="ts">
import { BlogAuthor } from 'blog-component'
import type { SanityWriteAdapter, GeneratedPost } from 'blog-component'

// Injected by the host — both route to server-side capabilities (see below).
const props = defineProps<{
  adapter: SanityWriteAdapter
  generate: (brief: string) => Promise<GeneratedPost>
}>()
</script>

<template>
  <BlogAuthor
    :adapter="props.adapter"
    :generate="props.generate"
    project-id="yourProjectId"
    dataset="production"
    @saved="(r) => console.log('saved', r._id)"
    @error="(msg) => console.error(msg)"
  />
</template>
```

A complete, runnable wiring (with a **stubbed** adapter + generate hook so it
needs no real credentials) lives in [`examples/consumer.ts`](./examples/consumer.ts).

## Secure write path (AC 4)

The component is **token-agnostic**: it never imports, stores, or sees a Sanity
write token. Instead it depends on the `SanityWriteAdapter` contract:

```ts
interface SanityWriteAdapter {
  save(post: BlogPostInput): Promise<{ _id: string }>
  uploadImage(file: File | Blob, meta?: ImageMeta): Promise<SanityImageValue>
}
```

**Recommended pattern — server-side signing/proxy endpoint.** The host implements
the adapter as a thin browser-side client that POSTs to its own tiny server
endpoint; that endpoint holds the write token and performs the actual Sanity
mutation / asset upload. The token never reaches the browser. The in-repo
[`dev/`](./dev/README.md) playground does exactly this (a Vite dev-server
middleware holds the secrets; `dev/main.ts` is a `fetch`-based adapter).

**`createReferenceWriteAdapter` is SERVER-ONLY.** For a ready-made adapter inside
your backend, `createReferenceWriteAdapter(writeClient)` wraps an
already-configured, write-capable `@sanity/client`. Because that client carries
the token, **only import this in server-side code** (a serverless function, API
route, or seed script) — never in browser-shippable code. See
[`src/sanity/write/reference-adapter.ts`](./src/sanity/write/reference-adapter.ts).

```ts
// SERVER-SIDE ONLY (e.g. inside an API route)
import { createClient } from '@sanity/client'
import { createReferenceWriteAdapter } from 'blog-component'

const writeClient = createClient({
  projectId, dataset,
  apiVersion: '2024-01-01',
  useCdn: false,                          // REQUIRED for writes (CDN is read-only)
  token: process.env.SANITY_WRITE_TOKEN,  // server-side secret ONLY
})
const adapter = createReferenceWriteAdapter(writeClient)
```

### Token scope (learned in practice)

The write token's **scope/role** decides whether writes succeed. From the
[`sanity-writes` skill](./.claude/skills/sanity-writes/SKILL.md):

- Use an **Administrator** or **Developer** scoped token (read + write on all
  datasets). These work on **any plan, including the FREE plan** — the pragmatic
  default for programmatic writes.
- A **Viewer** token is read-only: every mutation returns
  `403 Insufficient permissions; permission "create" required` (the exact failure
  the original treparole seed script hit).
- The dedicated **Editor** role is **plan-gated** (limited/unavailable on the free
  plan), so for tokens prefer **Administrator/Developer**.

Tokens are created in <https://sanity.io/manage> → your project → **API → Tokens**.

## Secure AI hook

AI drafting calls Claude, which needs an Anthropic API key — a **secret** that
must not reach the browser. The component is key-agnostic:

- **Recommended: the `generate` prop.** A hook the host runs **server-side**
  (e.g. via its own API route) and resolves a `GeneratedPost`. The key stays on
  the server. When `generate` is supplied, `aiOptions` is ignored.
- **`aiOptions` / `generatePostBody`** are for **server-side callers only**.
  `generatePostBody(brief, { apiKey })` builds an Anthropic client from the key,
  so passing `aiOptions.apiKey` in client-shippable code would leak the key.
  **Never embed the key in client JS.**

Model: `DEFAULT_AI_MODEL` is `claude-sonnet-4-6`. Override it with
`generatePostBody(brief, { apiKey, model })` (or your server hook) — e.g.
`claude-haiku-4-5-20251001` produces drafts roughly 3–4× cheaper, handy for
demos and high-volume drafting.

```ts
// SERVER-SIDE: an API route the `generate` hook calls.
import { generatePostBody } from 'blog-component'

export async function draft(brief: string) {
  return generatePostBody(brief, {
    apiKey: process.env.ANTHROPIC_API_KEY,   // server-side secret ONLY
    model: 'claude-haiku-4-5-20251001',      // optional, cheaper drafts
  })
}
```

## Publishing semantics (slug + publishedAt)

The read queries filter on fields a brand-new post does not otherwise carry:
`POST_BY_SLUG_QUERY` matches on `slug.current`, and `POST_LIST_QUERY` requires
`defined(publishedAt) && publishedAt <= now()`. So on **CREATE**, `<BlogAuthor>`
(when `autoPublish` is `true`, the default) runs the composed post through
`withPublishDefaults` before saving:

- derives `slug` from the title via `slugify` (only when absent/empty), and
- stamps `publishedAt = now` (only when absent/empty/whitespace),

so a freshly authored post is immediately visible to the read path.

Guarantees:

- **Existing posts and host-supplied values are never overwritten.** An UPDATE
  (a post with an `_id`) is never touched; a non-empty host `slug`/`publishedAt`
  on CREATE wins.
- **Slug uniqueness is NOT guaranteed.** `slugify(title)` is deterministic, so two
  posts with the same title get the same `slug.current`, and `POST_BY_SLUG_QUERY`'s
  `[0]` makes the others unreachable. **Uniqueness is the host's responsibility**:
  supply your own unique `slug`, or set `autoPublish={false}` and mint one (e.g.
  append a short id/date).
- `withPublishDefaults(post, { now? })` is exported as a pure, token-free helper if
  you want the same behavior outside the component.

## Image upload

`<ImageUploader>` and the `useImageUpload` composable upload a **user-supplied**
photo (no AI image generation) through the same `SanityWriteAdapter` (its
`uploadImage`), then append an image block — carrying `alt` / `caption` /
`credit` / `size` — into the PortableText body via `appendImageToBody` (each
block gets a unique `_key`). `<BlogAuthor>` already embeds this; `useImageUpload`
is available for custom UIs. Client-side validation defaults to `image/*` up to
`DEFAULT_MAX_IMAGE_BYTES` (8 MB), overridable via the `validation` prop
(`{ maxBytes, accept }`).

## Required Sanity schema

Your Sanity Studio must define the content model the read/write paths expect —
chiefly a `post` document (`title`, `slug`, `publishedAt`, `author`, `mainImage`,
`excerpt`, `body`), an `author` document, and a `blockContent` array type whose
members include the standard block (with `link`/`internalLink` marks) and an
`image` member with `alt`/`caption`/`credit`/`size`.

- Full field-by-field reference, and exactly which fields each read query and the
  publish path depend on: **[`docs/SCHEMA.md`](./docs/SCHEMA.md)**.
- **Copy-paste source:** the working schema files in
  **[`studio/schemaTypes/`](./studio/schemaTypes/)** — drop them into your own
  Studio. See **[`studio/README.md`](./studio/README.md)**.

## Running the in-repo example

Two runnable surfaces ship in the repo (neither is part of the published package
— `files` only ships `dist/`):

### `dev/` — the authoring + preview playground

Mounts `<BlogAuthor>` end-to-end with a live `<BlogPostPreview>` and a read-back
panel, against a real Sanity project and the real Claude API. Secrets stay
server-side in a Vite dev-server middleware.

```sh
cp .env.example .env   # fill projectId/dataset + server-side token & key
npm run dev            # http://localhost:5173
```

See **[`dev/README.md`](./dev/README.md)** for the `.env` layout and the security
model.

### `studio/` — visual content management

A self-contained Sanity Studio for browsing/editing the same dataset.

```sh
cd studio
npm install
npx sanity login       # interactive — run in your own terminal, once
npm run dev            # http://localhost:3333
```

See **[`studio/README.md`](./studio/README.md)**.

## Scripts

| Command                  | Description                                                          |
| ------------------------ | ------------------------------------------------------------------- |
| `npm run dev`            | Run the `dev/` authoring + preview playground.                      |
| `npm run build`          | Type-check, then build the ESM bundle + `.d.ts`.                    |
| `npm test`               | Run the Vitest unit suite once.                                     |
| `npm run lint`           | Run ESLint over `.ts`/`.vue` sources.                               |
| `npm run typecheck`      | Run `vue-tsc` over `src/` (build config) in no-emit mode.           |
| `npm run typecheck:test` | Type-check the spec files too (`tsconfig.test.json`, incl. `tests/`). |

`npm run typecheck` uses `tsconfig.build.json`, which excludes `tests/`;
`npm run typecheck:test` adds the spec files so type regressions in the public
contract exercised by tests are caught. CI
([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) runs lint → typecheck
→ typecheck:test → unit tests → build on every push and pull request (Node 20).

## Build output

- `dist/blog-component.js` — ESM bundle (`vue` and the Sanity/Anthropic SDKs left external).
- `dist/index.d.ts` — rolled-up type declarations.
- `dist/blog-component.css` — component styles (`import 'blog-component/style.css'`).

## Releasing

Maintainers: see **[`RELEASING.md`](./RELEASING.md)** for the step-by-step guide
to set up the repo, tag a SemVer release, and verify the published types.
