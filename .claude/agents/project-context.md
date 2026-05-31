---
project_name: blog-component
project_type: library
generated_at: 2026-05-29T17:57:48.344Z
schema_version: 1
---

## What this is
A reusable Vue 3 + TypeScript component for AI-assisted blog authoring on top of Sanity.
Claude (Anthropic SDK) drafts/formats the post body as PortableText blocks; the user uploads
their own photos as Sanity image assets; the component renders a live preview and writes the
post back to a Sanity dataset. It is published from a personal GitHub repo and installed into
the user's other Vue projects.

## Required reading before working
`blog-implementation-guide.md` (repo root) is the canonical reference — it documents a working
Vue 3 + Sanity + Firebase blog (`treparole-website`) including the full Sanity schema
(`post`, `author`, `category`, `blockContent`, `callout`, `gallery`), the `@portabletext/vue`
renderer pattern, GROQ query patterns (separate list vs detail; `publishedAt <= now()` for
scheduling; expanding `internalLink` references), and the gotchas below. Reuse its patterns
rather than reinventing them.

## Non-obvious constraints (from the guide — do not relearn the hard way)
- **Sanity writes require an elevated (Admin/write) token.** Free-plan "Editor" role does not
  exist for humans; a Viewer-scoped token fails with `403 permission "create" required`
  (guide problems #1, #8). The write token must NOT be bundled into client JS — route writes
  through a small backend/signing endpoint or have the host app inject the token at runtime.
- **Images are user-uploaded photos**, stored as Sanity image assets with `alt`/`caption`/
  `credit`/`size`. No AI image generation.
- **Every custom PortableText block/mark needs a renderer** in the `components` map, or it
  silently renders nothing (only a console warning). When adding a body type, add its renderer.
- **Lists lose their markers** under a global CSS reset — set `list-style` explicitly in the
  post scope (`:deep(ul/ol/li)`).
- **CORS**: each consuming origin (localhost + the host app's domains) must be added to the
  Sanity project's CORS Origins, or the browser client fails to load posts.
- **CMS is Sanity, kept (not abstracted).** Consumers supply their own `projectId`/`dataset`.

## Research guidance for the orchestrator
Do NOT run a blanket "research the whole stack" pass — most of it is already covered and
re-deriving it wastes effort. Coverage map:
- Sanity reads, schema, GROQ, `@portabletext/vue`, image-url, CORS, deploy gotchas →
  already documented in `blog-implementation-guide.md`. No research needed.
- Vue 3 + `<script setup>` + vue-tsc → covered by the installed `vue` / `vue-best-practices`
  skills. Vite library build mode is standard. No research needed.
- Claude API / Anthropic SDK (prompt caching, structured output) → covered by the installed
  `claude-api` skill. For TASK-004 the only genuinely new part is the output contract (forcing
  valid PortableText blocks) — a short spike or go straight to design, the orchestrator's call.

Spin up exactly ONE narrowly-scoped researcher, focused on the project's real unknown:
**Sanity programmatic WRITES — the write/token permission model, where to sign writes safely
(self-hosted signing endpoint vs host-injected token vs Sanity Growth plan), and the Sanity
Asset Upload API for user photos (TASK-005 and TASK-006).** The original blog never solved this
(its seed script hit `403 permission "create" required`), so it is not in the guide. The
researcher should produce a reusable skill at `.claude/skills/sanity-writes/`. Do this BEFORE
planning the authoring flow, since TASK-005 blocks TASK-006 and TASK-007.

## Stack
- library_language: typescript
- frontend: Vue 3 (`<script setup lang="ts">`) + Vite library build mode
- cms: Sanity.io (read via GROQ, write posts to the dataset)
- rich_text_render: `@portabletext/vue`; image CDN: `@sanity/image-url`
- ai_text: Claude API (Anthropic SDK) → PortableText body blocks
- audience: Myself / my own projects (Vue app developer)
- package_manager: npm
- distribution_channel: github

## Testing conventions
Use the testing tool that fits this stack — the project standard is to keep a fast unit suite runnable via the project's default test command, and to write a failing test before any new behavior lands. Tests live next to the code they exercise (or under a top-level tests/ tree, whichever already exists in this repo); follow the local convention rather than introducing a new one.

## Linting and formatting
Run the project's linter and formatter before every commit. If the repo ships a config (e.g., .eslintrc, ruff.toml, .prettierrc, gofmt defaults), defer to it without arguing; if no config exists yet, use the ecosystem-standard tool and add a minimal config rather than reformatting the whole tree in a drive-by change.

## Type-specific guidance
- Treat every exported symbol as part of the public API — adding one is cheap, removing or renaming one is a semver-major change.
- Backwards compatibility is a feature, not an afterthought. Deprecate first, remove later, and document the migration path in the changelog.
- Consumer-facing types and error shapes are part of the contract; widening a return type is fine, narrowing it is breaking.
- Avoid runtime dependencies wherever a small built-in alternative exists — every transitive dep is something a consumer inherits.
