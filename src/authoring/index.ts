// Barrel for the authoring path (TASK-007).
//
// `<BlogAuthor>` is the headline public component: it COMPOSES the AI draft
// (TASK-004), live preview (TASK-003), photo upload (TASK-006), and Sanity write
// (TASK-005) paths into one end-to-end flow. It is token-agnostic and
// key-agnostic — the host injects the `SanityWriteAdapter` (for save + upload)
// and an AI `generate` hook (or server-side `aiOptions`); no secret ever lives
// in the component.
//
// Re-exported from the package entry (src/index.ts).

export { default as BlogAuthor } from './BlogAuthor.vue'
