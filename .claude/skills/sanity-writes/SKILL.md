---
name: sanity-writes
description: >-
  Load when implementing Sanity document WRITES (create/patch/transactions),
  write tokens and the Sanity permission/role model, the token-handling
  architecture for a browser component, or Sanity asset/image uploads from the
  blog-component. Covers @sanity/client mutation APIs, why a Viewer-scoped token
  returns 403 "permission create required", where to safely hold a write token
  (signing endpoint vs host-injected token vs Growth Editor role), the
  recommended save()/uploadImage() host interface, and the assets.upload + attach
  pattern with alt/caption/credit/size. Does NOT cover reads, GROQ, PortableText
  rendering, or image-url (those are in blog-implementation-guide.md).
---

# Sanity programmatic writes (mutations + asset uploads)

This skill covers the **write side** of Sanity for the `blog-component`. The read
side (GROQ, `@portabletext/vue`, `@sanity/image-url`, CORS for reads) is already
documented in `blog-implementation-guide.md` — do not re-derive it here.

The original `treparole-website` blog never solved writes: its seed script hit
`403 Insufficient permissions; permission "create" required`. This skill exists so
the team does not relearn that the hard way.

> Sourcing note: the API shapes and facts below are from the Sanity docs as of the
> Jan 2026 knowledge cutoff (live fetch was unavailable in the authoring run).
> Verify version-sensitive details (current role list, plan pricing) against the
> live docs before relying on them. Primary references are listed at the bottom.

---

## 1. Write client setup

A write client differs from a read client in three ways: **`useCdn: false`**, a
**`token`**, and a pinned **`apiVersion`**. The CDN (`apicdn.sanity.io`) only serves
cached reads — it cannot mutate and ignores tokens for writes.

```ts
import { createClient } from '@sanity/client'

const writeClient = createClient({
  projectId: 'yourProjectId',
  dataset: 'production',
  apiVersion: '2024-01-01', // pin a date; never leave unset
  useCdn: false,            // REQUIRED for writes — CDN is read-only
  token: process.env.SANITY_WRITE_TOKEN, // server-side ONLY (see §3)
})
```

- `useCdn: false` — writes always go to `api.sanity.io`. If you reuse one client for
  reads + writes, set `false`; otherwise keep a separate read client with `useCdn: true`.
- `apiVersion` — pin to a `YYYY-MM-DD` date so API behavior is stable across SDK
  upgrades. Leaving it unset triggers a deprecation warning and uses an unstable default.
- `token` — a write-scoped token. NEVER ship this in browser JS (see §3).

---

## 2. Mutation APIs

All mutations return a Promise. Use them server-side (or behind the host's `save()`
hook), never with a bundled token.

### create / createOrReplace / createIfNotExists

```ts
// create: fails if _id already exists; omit _id to let Sanity assign one
const created = await writeClient.create({
  _type: 'post',
  title: 'My post',
  slug: { _type: 'slug', current: 'my-post' },
  body: portableTextBlocks, // array of PT blocks
})
// created._id, created._rev are returned

// createOrReplace: upsert by _id (overwrites the whole document)
await writeClient.createOrReplace({ _id: 'post-123', _type: 'post', title: 'X' })

// createIfNotExists: no-op if _id exists (good for idempotent seed/import)
await writeClient.createIfNotExists({ _id: 'post-123', _type: 'post', title: 'X' })
```

### patch (partial update)

```ts
await writeClient
  .patch('post-123')        // document _id
  .set({ title: 'New title' })
  .setIfMissing({ tags: [] })
  .insert('after', 'body[-1]', [newBlock]) // append a PT block
  .unset(['internalNotes'])
  .commit()                 // nothing happens until commit()
```

`.commit()` is what sends the mutation. Forgetting it is a silent no-op. Use
`.commit({ autoGenerateArrayKeys: true })` when inserting array items (PT blocks need
unique `_key`s — without keys Sanity Studio and patches misbehave).

### transaction (atomic multi-doc)

```ts
await writeClient
  .transaction()
  .create({ _type: 'author', _id: 'author-1', name: 'A' })
  .patch('post-123', (p) => p.set({ author: { _type: 'reference', _ref: 'author-1' } }))
  .commit()
```

A transaction is all-or-nothing. Use it when a post and its newly-created references
must land together.

### delete

```ts
await writeClient.delete('post-123')
```

---

## 3. Token & permission model (the core gotcha)

### Minting a token
sanity.io/manage -> your project -> **API** -> **Tokens** -> **Add API token**.
Pick a name and a permission scope. Tokens are **long-lived and do not expire**;
treat them as secrets and rotate by deleting/recreating. There is no built-in TTL —
"short-lived" tokens must be manufactured by you (e.g. a signing endpoint that
issues a request-scoped session, not a raw Sanity token).

### Roles and the 403 trap (confirmed by the original blog)
On the **free plan** the human role set is effectively **Administrator / Viewer /
(Blueprints manager)** — there is **no real human "Editor" role**. The token dropdown
may *show* "Editor", but if the issuing user is not a real Editor, the token inherits
**Viewer** permissions, and any write returns:

```
403 Insufficient permissions; permission "create" required
```

This is exactly the error the `treparole-website` seed script hit (guide problem #1/#8).

### What actually lets you write
- **Admin token** (free plan): an Administrator-scoped token has `create`/`update`.
  Works, but it is maximally privileged — a leaked admin token can do anything to the
  project. Acceptable only when it lives server-side and never in a bundle.
- **Growth plan ($-per-user) with a real Editor role**: gives a properly scoped,
  least-privilege write role and per-user tokens. This is the "correct" answer if you
  want non-admin, auditable writes.

> Bottom line on the plan question: **to write programmatically you need either an
> Administrator-scoped token (any plan, including free) or a real Editor role which
> requires the Growth plan.** A Viewer token can never write. For this component,
> an Admin token held by a signing endpoint is the pragmatic default (see below).

---

## 3b. Where to hold the write token — RECOMMENDED ARCHITECTURE

A write token MUST NOT ship in client-side JS (anyone can read the bundle / network
tab and steal a project-wide write credential). Options:

| Option | Security | Effort | Notes |
|---|---|---|---|
| (a) Self-hosted backend / serverless signing endpoint that holds the token and proxies mutations | Strong — token never leaves the server | Low–Medium (one route) | Host owns the secret; component calls the route |
| (b) Host app injects a short-lived/scoped token at runtime into the component | Weak–Medium — token still reaches the browser; Sanity tokens don't expire, so "short-lived" needs a custom session layer | Low | Only acceptable for trusted/internal tools where the browser is the operator's own machine |
| (c) Sanity Growth plan + real Editor role + per-user tokens | Strong + auditable | Medium ($ + role setup) | Best for multi-user/auditable writes; still must not bundle the token |

### Default recommendation
Because the component's consumers are **the developer's own Vue projects**, the
component must stay **token-agnostic**: it never imports, stores, or knows the write
token. Instead it accepts **host-implemented hooks** and the host decides how to back
them — almost always option (a), a tiny serverless function holding an **Admin token**.

The component therefore exposes an injected adapter; it never calls `client.create`
with a token itself.

```ts
// Public contract the component exposes (host implements these)
export interface SanityWriteAdapter {
  /** Persist a post. Returns the saved doc id. Host routes this to a server
   *  endpoint that holds the write token and calls client.create/patch. */
  save(post: BlogPostInput): Promise<{ _id: string }>
  /** Upload a user photo. Returns the Sanity asset reference. Host routes to a
   *  server endpoint that calls client.assets.upload. */
  uploadImage(file: File, meta?: ImageMeta): Promise<SanityImageValue>
}

export interface ImageMeta { alt?: string; caption?: string; credit?: string; size?: string }

export interface SanityImageValue {
  _type: 'image'
  asset: { _type: 'reference'; _ref: string }
  alt?: string
  caption?: string
  credit?: string
  size?: string
}
```

```ts
// Component usage — token NEVER appears here
const props = defineProps<{ adapter: SanityWriteAdapter }>()
async function onSave(post: BlogPostInput) {
  const { _id } = await props.adapter.save(post)
}
```

```ts
// Host-side reference implementation of save() (serverless route, server-only token)
import { createClient } from '@sanity/client'
const writeClient = createClient({ projectId, dataset, apiVersion: '2024-01-01', useCdn: false, token: process.env.SANITY_WRITE_TOKEN })

export async function save(post: BlogPostInput) {
  return post._id
    ? writeClient.patch(post._id).set(post).commit()
    : writeClient.create({ _type: 'post', ...post })
}
```

This keeps the token on the server, lets each consuming project choose its own
backend, and means option (b) or (c) are drop-in alternative adapter implementations
without changing the component.

---

## 4. Asset (image) upload API

User photos are uploaded as Sanity image assets, then referenced from the document.
This requires a write token too, so it goes through the host's `uploadImage()` hook —
not from the browser with a bundled token.

```ts
// On the server / behind uploadImage()
const asset = await writeClient.assets.upload('image', file, {
  filename: file.name,         // optional but recommended
  contentType: file.type,      // e.g. 'image/jpeg'
})
// asset._id is the asset document id, e.g. 'image-abc123-2000x1500-jpg'
```

`file` can be a `File`/`Blob` (browser) or a `Buffer`/`ReadableStream` (Node). The
first arg is the asset type: `'image'` or `'file'`. It returns the **asset document**
(with `_id`, dimensions metadata, `url`, etc.).

### Attaching the asset to a document (the correct shape)
The inline-image field shape used by this project's schema is an `image` object with
a reference to the asset plus the extra fields `alt`/`caption`/`credit`/`size`:

```ts
const imageValue: SanityImageValue = {
  _type: 'image',
  asset: { _type: 'reference', _ref: asset._id },
  alt: 'A description',
  caption: 'Shot at golden hour',
  credit: 'Photo: Jane Doe',
  size: 'full',
}

// as mainImage:
await writeClient.patch(postId).set({ mainImage: imageValue }).commit()
// or appended into the PortableText body (needs a _key):
await writeClient.patch(postId)
  .setIfMissing({ body: [] })
  .insert('after', 'body[-1]', [{ ...imageValue, _key: crypto.randomUUID() }])
  .commit({ autoGenerateArrayKeys: true })
```

### Constraints & error modes
- **Max asset size**: roughly **fits within the API request body limit (multi-MB
  range)**; very large originals can be rejected. Validate file size client-side
  before upload and surface a friendly error. (Confirm the current hard limit in the
  live docs — it is plan/limit sensitive.)
- **Type**: pass the right `contentType`; non-image content under `'image'` is rejected.
- **Auth**: same token rules as §3 — a Viewer token gives the same `403 create`-class
  failure on upload.
- Network/abort: `assets.upload` returns a promise; wrap in try/catch and map failures
  to the component's error channel so the UI can retry.

---

## 5. CORS for writes & rate limits

- **CORS**: every browser origin that talks to Sanity (localhost + each host app
  domain) must be added under sanity.io/manage -> API -> **CORS Origins**. For writes
  specifically you must also **tick "Allow credentials"** when the browser sends a
  token/cookie. In the recommended architecture the browser only talks to the host's
  own backend, so the Sanity CORS allowlist is mainly a read-side concern — but if a
  host chooses option (b) and calls Sanity directly from the browser, the origin needs
  "Allow credentials" enabled or the mutation is blocked.
- **Rate limits**: mutations are rate-limited per project; batch related changes into a
  single `transaction()` or a single `patch` chain instead of many small commits. Bulk
  imports should use `createIfNotExists` for idempotency and back off on 429s.

---

## Pitfalls (read this list before debugging)

1. **`403 Insufficient permissions; permission "create" required`** — your token is
   Viewer-scoped. On the free plan there is no real human Editor; use an Admin token
   or move to Growth with a real Editor role. (This sank the original seed script.)
2. **Write token in the client bundle** — never. The component must take a host
   `save()`/`uploadImage()` adapter; the token lives on a server.
3. **`useCdn: true` on a write client** — the CDN is read-only; writes must use
   `useCdn: false`.
4. **Forgetting `.commit()`** — `patch()`/`transaction()` do nothing until committed.
5. **Wrong image attach shape** — must be
   `{ _type: 'image', asset: { _type: 'reference', _ref: asset._id }, ... }`, not the
   raw asset object. PT body images also need a `_key`.
6. **Missing array `_key`s** — use `commit({ autoGenerateArrayKeys: true })` when
   inserting PortableText/array items.
7. **Missing CORS "Allow credentials"** — only relevant if a host calls Sanity from the
   browser with a token (option b); preferred architecture avoids it.
8. **Unpinned `apiVersion`** — pin a date string for stable behavior.

---

## Primary references (verify against live docs)
- JS client (mutations, assets): https://www.sanity.io/docs/js-client
- HTTP API — mutations: https://www.sanity.io/docs/http-mutations
- HTTP API — assets: https://www.sanity.io/docs/http-api-assets
- Access / tokens & roles: https://www.sanity.io/docs/api-cdn (read) and
  https://www.sanity.io/docs/access-your-data / sanity.io/manage token UI
- API versioning: https://www.sanity.io/docs/api-versioning
- CORS: https://www.sanity.io/docs/cors
- Plans/roles: https://www.sanity.io/pricing
