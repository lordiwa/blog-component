---
name: blog-component
type: library
created_at: 2026-05-29T17:57:48.336Z
schema_version: 1
---

# blog-component

## Description
A reusable Vue 3 + TypeScript component that helps the user author blog posts with AI assistance — Claude generates and formats the body text as Sanity PortableText, the user uploads their own photos as Sanity image assets, and the component renders a live preview — packaged for reuse across the user's own projects. Content lives in Sanity (the component reads and writes posts to a dataset).

## Target users
Myself, reusing the component across my own Vue projects.

## Primary use cases
- collaboration
- reporting
- automation
- integration

## Success criteria
I can install the component from my GitHub repo into another project and use it to draft and format a blog post — including images — with AI assistance.

## Stack
- library_language: typescript
- frontend: Vue 3 (`<script setup lang="ts">`) + Vite (library build mode)
- cms: Sanity.io (headless; component reads via GROQ and writes posts to the dataset)
- rich_text_render: `@portabletext/vue` with a custom `components` map
- image_cdn: `@sanity/image-url`
- ai_text: Claude API (Anthropic SDK) — generates/formats the body as PortableText blocks
- images: user-uploaded photos stored as Sanity image assets (NOT AI-generated)
- audience: Myself / my own projects (Vue app developer)
- package_manager: npm
- distribution_channel: github

## Reference & architecture
The companion `blog-implementation-guide.md` documents a working Vue 3 + Sanity + Firebase
blog (the `treparole-website` project) and is the canonical source for the Sanity schema,
the PortableText renderer, GROQ query patterns, and the known gotchas. This project extracts
that blog into a reusable, AI-assisted **authoring** component. Read that guide before
planning any phase that touches Sanity, PortableText, or content modeling.

Key architectural decisions and open risks:
- **Writes need an elevated token.** Reads from Sanity work with a public CDN client, but
  creating/updating posts requires a write token. Per the guide (problems #1 and #8), the free
  Sanity plan has no real "Editor" role — a Viewer-scoped token returns `403 permission "create"
  required`. A write token must NOT ship in the client bundle, so writes go through a small
  signing endpoint/backend (or the host app supplies the token at runtime). This must be
  resolved early — it shapes the whole authoring flow.
- **Images are uploaded by the user**, then stored as Sanity image assets with the guide's
  extra fields (`alt`, `caption`, `credit`, `size`). No image generation.
- **CMS is kept (not abstracted).** The component is coupled to Sanity; each consuming project
  supplies its own `projectId`/`dataset` and must add the host origin to Sanity CORS Origins.
- The component is consumed by installing from a personal GitHub repo into other Vue projects.
