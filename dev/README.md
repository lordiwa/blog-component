# Local dev playground (TASK-008)

A LOCAL, dev-only visual playground to run `<BlogAuthor>` end-to-end in a real
browser against a real Sanity project and the real Claude API. It is **not
shipped** — `package.json` `files` ships `dist/` only. None of this directory,
`vite.dev.config.ts`, or `.env` is published.

## Security model (the whole point of this component)

The component is **token-agnostic**. Secrets must **never** reach the browser
bundle:

- The Sanity **write token** and the **Anthropic API key** live ONLY in your
  local `.env`, are loaded server-side by `vite.dev.config.ts` via `loadEnv`,
  and are captured in the Node closure of `dev/server-plugin.ts`. They are
  exposed to the browser through three `/api/*` endpoints, never as values.
- The browser only ever sees the **public** `VITE_SANITY_PROJECT_ID` /
  `VITE_SANITY_DATASET` (used for read-back + image URLs against the public
  dataset — no token).
- Secrets are deliberately **not** passed through Vite `define`.

The client-side `SanityWriteAdapter` in `dev/main.ts` implements the same
contract `<BlogAuthor>` already depends on, but routes `save` / `uploadImage`
to the server middleware over `fetch`. Likewise the `generate` hook POSTs to
`/api/generate`.

## Setup

1. Copy the template and fill in the two secrets:

   ```sh
   cp .env.example .env
   ```

   ```ini
   VITE_SANITY_PROJECT_ID=gvc4yjqj   # public
   VITE_SANITY_DATASET=production    # public
   SANITY_WRITE_TOKEN=<admin/editor-scoped token>   # SECRET, server-side only
   ANTHROPIC_API_KEY=<your key>                      # SECRET, server-side only
   ANTHROPIC_MODEL=claude-haiku-4-5-20251001         # optional, dev-only
   ```

   - The Sanity token must be **Administrator** (works on any plan, incl. free)
     or a Growth-plan **Editor**. A Viewer token cannot write
     (`403 permission "create" required`).
   - CORS for `http://localhost:5173` with credentials must be configured in
     the Sanity project (sanity.io/manage → API → CORS Origins). For target
     `gvc4yjqj` this is already done.
   - **`ANTHROPIC_MODEL`** (optional) picks the Claude model `/api/generate`
     uses. The playground defaults to **Claude Haiku 4.5**
     (`claude-haiku-4-5-20251001`) — the cheapest current model — to keep demo
     costs down. Override it with any other model id, or set it **empty** to
     fall back to the library's `DEFAULT_AI_MODEL` (`claude-sonnet-4-6`, ~4x the
     per-generation cost). This is dev-only and does not change the library
     default.

2. Run the playground:

   ```sh
   npm run dev
   ```

3. Open http://localhost:5173 (the dev server opens `dev/index.html`).

## The round-trip (TASK-011)

1. Type a brief → **Generate draft** (calls `/api/generate` → `generatePostBody`).
2. Edit title/excerpt, optionally upload an image (`/api/upload`).
3. **Save to Sanity** (`/api/save`). On **create** (no `_id`) the server injects:
   - `slug = { _type: 'slug', current: slugify(title) }` (only if absent), and
   - `publishedAt = new Date().toISOString()` (only if absent),

   so the new post satisfies the TASK-002 read queries (`POST_BY_SLUG_QUERY`
   matches on `slug.current`; `POST_LIST_QUERY` requires a past `publishedAt`).
   On **update** (existing `_id`) the server does NOT touch slug/publishedAt.
4. `<BlogAuthor>`'s `@saved` event refreshes the read-back list, so the freshly
   authored post appears immediately. Click it to fetch the full body
   (`POST_BY_SLUG_QUERY`) and render it via `<BlogPostPreview>`.

> **Note:** the target dataset `gvc4yjqj` starts **empty**, so the read-back list
> is empty until you author and save the first post.
