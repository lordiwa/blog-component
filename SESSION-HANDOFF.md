# Session handoff — blog-component

> Pause point: **2026-05-30**. Safe to restart the machine. Nothing is mid-flight.
> To resume: open a new orchestrator chat in this project and say *"resume"* — the
> orchestrator reads `state/session.json` → `state/sessions/<id>/session.json` (the
> RESUME-FIRST contract) plus this file. Machine restart does NOT delete `node_modules`
> (it lives in this folder); if it's ever gone, run `npm install`.

## What this project is
Reusable **Vue 3 + TypeScript** library for **AI-assisted blog authoring on Sanity**.
Claude drafts/formats the body as Sanity PortableText; the user uploads their own photos
as Sanity image assets; a live preview renders it; the post is saved back to Sanity.
Distributed from a personal GitHub repo, installed into the user's other Vue projects.
Canonical reference: `blog-implementation-guide.md` (the original Sanity+Firebase blog).

## Status: Phase 1 ✅ and Phase 2 ✅ complete

| Task | What | Status |
|------|------|--------|
| TASK-001 | Scaffold (Vite library mode, ESM + `.d.ts`) | ✅ done |
| TASK-002 | Sanity read client + GROQ + types | ✅ done |
| TASK-003 | PortableText preview renderer | ✅ done |
| TASK-004 | Claude → PortableText generation | ✅ done |
| TASK-005 | `SanityWriteAdapter` (token-agnostic write path) | ✅ done |
| TASK-006 | User photo upload → Sanity image assets | ✅ done |
| TASK-007 | `<BlogAuthor>` capstone (compose all of the above) | ✅ done |

Every real-logic task ran **developer → orchestrator verification → fresh-context reviewer**.
A `sanity-writes` researcher produced `.claude/skills/sanity-writes/`.

**Current verified state:** `npm run build && npm test && npm run lint` →
build OK · **84/84 tests** · **lint 0 errors** (5 cosmetic warnings remain in the
`BlogPlaceholder.vue` stub). Bundle: `dist/blog-component.js` ~26 kB ESM + `index.d.ts`.
Console clean (the one `Unknown block type "callout"` line is an intentional test of the
missing-renderer guard).

## Key facts for whoever resumes
- **NOT a git repo** — no commits were made this session. If you want history, `git init` first.
- **node_modules is installed.** Deps added: `@sanity/client`, `@portabletext/vue`,
  `@sanity/image-url`, `@anthropic-ai/sdk` — all in `dependencies` and **externalized** in
  `vite.config.ts` (not bundled). `@types/node` is a devDep.
- **Subagents cannot run npm** (sandbox-denied) — the **orchestrator runs all verification**.
- Public API is exported from `src/index.ts` (read client, render, AI, write adapter, upload, `<BlogAuthor>`).

## Architectural decisions (don't relitigate)
1. **Sanity kept, not abstracted.** Consumers supply `projectId`/`dataset` + CORS origins.
2. **Writes are token-agnostic.** Component never holds a Sanity token; host injects a
   `SanityWriteAdapter`. Default backing = server-side signing endpoint. Admin token works on
   ANY plan incl. free; Viewer token → 403. (skill: `sanity-writes`)
3. **AI = text only** (images are user-uploaded). Claude via `@anthropic-ai/sdk`, forced tool
   `emit_post` → PortableText; key-agnostic (host injects client/apiKey, server-side).
   `DEFAULT_AI_MODEL = 'claude-sonnet-4-6'`.

## Next up — Phase 3 (NOT started)
- **TASK-008** — Consumer integration guide + example app (install-from-GitHub, projectId/dataset,
  **CORS origins step**, wire the AI hook + write/signing layer, required Sanity schema). Also folds
  in the write-path docs deferred from TASK-005.
- **TASK-009** — Build/types/publish + CI. **Scope add:** add a typecheck pass that includes
  `tests/` (currently excluded) — this will surface **pre-existing type errors in
  `ai-generate`, `render-preview`, `write-adapter` specs** that must be fixed then.

## ⚠️ Decisions waiting on the user
- **TASK-011 (priority high, product decision):** a post authored from scratch in `<BlogAuthor>`
  saves but is **invisible to both read queries** (no `slug`/`publishedAt`). Decide: auto-derive
  `slug` from title vs host-supplied; and `publishedAt` = publish-now vs draft-by-default vs
  scheduled. TASK-007 documents this as the host's responsibility for now.
- **Phase 3 cadence:** sequential-with-OK vs chained (Phase 2 was run chained).

## Backlog follow-ups (tracked, non-blocking)
- **TASK-010** — read-path robustness (error normalization, detail-query scheduling filter, null-tolerance).
- **TASK-011** — new-post slug/publishedAt (above).
- Cosmetic: 5 `vue/*` lint warnings in `src/components/BlogPlaceholder.vue` (the stub, to be replaced).
- The `ImageUploader` standalone still omits empty meta on its own emit (BlogAuthor compensates);
  align in a TASK-006 follow-up if `ImageUploader` is used outside `<BlogAuthor>`.

## How to verify after resuming
```
npm install        # only if node_modules is missing
npm run build      # vue-tsc typecheck + vite library build (emits dist/)
npm test           # vitest — expect 84 passing across 8 files
npm run lint       # eslint — expect 0 errors (5 cosmetic warnings in the placeholder)
```
