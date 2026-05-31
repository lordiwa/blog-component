---
id: sanity-write-token-403-viewer
tags: [sanity, write, token, permissions, 403, mutations, asset-upload]
symptoms:
  - "403 Insufficient permissions; permission \"create\" required"
  - "Sanity write/seed script fails despite an 'Editor' token"
problem: Programmatic writes/uploads to Sanity fail with 403 even though the token dropdown said "Editor".
last_seen_at: 2026-05-29
---

On the Sanity free plan there is no real human "Editor" role (only Administrator / Viewer /
Blueprints manager). A token labeled "Editor" inherits Viewer permissions and cannot write,
returning `403 ... permission "create" required`.

**Fix:** use an Administrator-scoped token (works on ANY plan, including free) or upgrade to
Growth for a real Editor role. Never bundle the write token in client JS — route writes through
a server-side signing/proxy endpoint (`useCdn:false`, pinned `apiVersion`).

**Image attach shape:** `{ _type:'image', asset:{ _type:'reference', _ref: asset._id }, alt, caption, credit, size }`.
PortableText body images additionally need a `_key` (commit with `{ autoGenerateArrayKeys: true }`).

See `.claude/skills/sanity-writes/SKILL.md` for the full patterns and the `SanityWriteAdapter`
host interface. Originated from the `treparole-website` blog, whose seed script hit this exact 403.
