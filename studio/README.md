# blog-component Studio

A self-contained [Sanity Studio](https://www.sanity.io/studio) (React + `sanity`
v5) for browsing and editing the **same** `gvc4yjqj` / `production` dataset that
the dev playground (`../dev/`) writes to. It is its own app with its own
`node_modules` and is fully independent of the `blog-component` library — it does
NOT touch the root `package.json`, the Vite configs, or `src/`.

The schema types (`schemaTypes/*.js`) are copied verbatim from the upstream
treparole Studio and match what the library expects (`post`, `author`,
`category`, `blockContent`, `callout`, `gallery`).

## What you'll see

Anything written to `gvc4yjqj/production` shows up here:

- The post the dev playground already created (and any future ones) appears
  under **Post**.
- The Vision tool (top nav) lets you run GROQ queries against the same dataset.

This is the editing/inspection counterpart to the playground: the playground
authors posts programmatically (AI draft → save), and this Studio lets you
browse and hand-edit them visually.

> Note: the playground's `<BlogAuthor>` save path mints `slug` and `publishedAt`
> on create, so posts it writes satisfy this Studio's `post` validation
> (`slug` and `publishedAt` are required fields).

## Prerequisites

`sanity login` is **interactive** and cannot be run for you — run it yourself in
a terminal. You only need to do it once per machine.

## Commands

```sh
# 1. Authenticate (interactive — run in your own terminal, once).
#    Either the global CLI:
sanity login
#    …or the Studio's local CLI (no global install needed):
cd studio
npx sanity login

# 2. Run the Studio locally (from the studio/ folder):
cd studio
npm install        # first time only — installs this app's own deps
npm run dev        # opens http://localhost:3333

# 3. (Optional) Deploy a hosted Studio to *.sanity.studio:
cd studio
npm run deploy     # the first deploy assigns an appId for you
```

## CORS

The local Studio at `http://localhost:3333` talks to the Sanity API. If you see
CORS / network errors loading documents, add `http://localhost:3333` as an
allowed CORS origin (with credentials) in
[sanity.io/manage](https://www.sanity.io/manage) → project `gvc4yjqj` → **API →
CORS Origins**. (The playground origin `http://localhost:5173` is already
configured; `3333` may need adding the first time you run the Studio.)
