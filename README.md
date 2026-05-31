# blog-component

Reusable Vue 3 + TypeScript component for AI-assisted blog authoring on top of
Sanity. This package is the library **shell** (TASK-001): a typed, installable
Vite library-mode build that currently exports a single placeholder component.
Sanity reads/writes, Claude-assisted drafting, and the PortableText preview land
in later tickets.

## Install (from GitHub)

```sh
npm install github:<your-user>/blog-component
# or pin a tag/commit
npm install github:<your-user>/blog-component#v0.0.1
```

`vue@^3.4.0` is a **peer dependency** — the consuming app provides it.

On a GitHub install npm runs the `prepare` script, which builds `dist/`
(the `dist/` folder is not committed). The package's `exports`/`types`/`files`
then resolve to the freshly built ESM bundle and `.d.ts`.

`@sanity/client@^6` is a **runtime dependency** of this package. It is left
external in the library build (not bundled), so it is installed transitively
when you install `blog-component` — you do not need to add it yourself, but a
deduped single copy in your app is recommended.

## Usage

```ts
import { BlogPlaceholder } from 'blog-component'
```

```vue
<script setup lang="ts">
import { BlogPlaceholder } from 'blog-component'
</script>

<template>
  <BlogPlaceholder title="Hello" />
</template>
```

## Sanity read path (TASK-002)

Create a client with **your own** Sanity config (nothing is hardcoded), then use
the typed read helpers:

```ts
import { createBlogClient, getPostList, getPostBySlug } from 'blog-component'
import type { Post, PostListItem } from 'blog-component'

const client = createBlogClient({
  projectId: import.meta.env.VITE_SANITY_PROJECT_ID, // required
  dataset: 'production',      // optional, defaults to 'production'
  apiVersion: '2024-01-01',   // optional, pinned default
  // useCdn defaults to true (fast cacheable reads)
})

const posts: PostListItem[] = await getPostList(client)
const post: Post | null = await getPostBySlug(client, 'my-post-slug')
```

- `getPostList` returns lightweight cards (no full `body`, plus a
  `bodyCharCount` — the character count of the flattened body text, not a word
  count; divide by ~1100 for a ~200 wpm read-time estimate), ordered
  `featured desc, publishedAt desc`, and excludes future-dated posts
  (`publishedAt <= now()`).
- `getPostBySlug` returns the full post with the author expanded and
  `internalLink` marks resolved to the target post's slug.

### CORS prerequisite (acceptance criterion AC4)

Reads against a **real** dataset only succeed when the consuming origin is
registered in the Sanity project's CORS Origins. This cannot be unit-tested
(no live credentials), so verify it manually:

1. In <https://sanity.io/manage> open your project → **API → CORS Origins**.
2. Add every origin that will call Sanity from the browser, e.g.
   `http://localhost:5173` (dev) and your deployed domains.
3. With a valid `projectId` (public dataset, or supply a read `token` for a
   private one), call `getPostList(client)` / `getPostBySlug(client, slug)` and
   confirm posts load without a CORS error in the console.

Without the origin registered the browser client fails to load posts (see
`blog-implementation-guide.md` section 11 and problem #2).

## Scripts

| Command             | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `npm run build`     | Type-check, then build the ESM bundle + `.d.ts`.     |
| `npm test`          | Run the Vitest unit suite once.                      |
| `npm run lint`      | Run ESLint over `.ts`/`.vue` sources.                |
| `npm run typecheck` | Run `vue-tsc` in no-emit mode.                       |

## Build output

- `dist/blog-component.js` — ESM bundle (`vue` and `@sanity/client` left external).
- `dist/index.d.ts` — rolled-up type declarations.
- `dist/blog-component.css` — component styles (`import 'blog-component/style.css'`).
