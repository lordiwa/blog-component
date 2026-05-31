// Reference example: how an EXTERNAL consumer wires up blog-component.
//
// This file is a documented reference, NOT a CI test and NOT part of the
// published package (`files` only ships `dist/`). It imports from the package
// entry the way a host app would (`from 'blog-component'`; here `from '../src'`
// resolves the same surface in-repo) and shows the full authoring + preview
// wiring with a STUBBED `SanityWriteAdapter` and `generate` hook — so it
// illustrates the contracts without needing real Sanity/Anthropic credentials.
//
// In a real app:
//   - the `adapter` methods POST to your own server endpoint that holds the
//     Sanity write token (see README "Secure write path"); and
//   - the `generate` hook calls your own server route that holds the Anthropic
//     key (see README "Secure AI hook").
// Neither secret ever reaches the browser.

import { createApp, defineComponent, h, ref } from 'vue'
import {
  BlogAuthor,
  BlogPostPreview,
  createBlogClient,
  getPostList,
} from '../src'
import type {
  SanityWriteAdapter,
  BlogPostInput,
  ImageMeta,
  SanityImageValue,
  GeneratedPost,
  Post,
  PostListItem,
} from '../src'

// Public, non-secret config. In a host app these come from env vars.
const PROJECT_ID = 'yourProjectId'
const DATASET = 'production'

// --- Read client -------------------------------------------------------------
// Nothing is hardcoded inside the library — you supply your own config. A public
// dataset needs no token; a private one takes a read `token`.
const client = createBlogClient({ projectId: PROJECT_ID, dataset: DATASET })

// --- STUB write adapter ------------------------------------------------------
// The component is token-agnostic: it only ever calls these two methods. Here we
// stub them so the example runs without a backend. In production, route each
// call to a server endpoint that holds the write token.
const adapter: SanityWriteAdapter = {
  async save(post: BlogPostInput): Promise<{ _id: string }> {
    // Real impl: `await fetch('/api/save', { method:'POST', body: JSON... })`.
    // eslint-disable-next-line no-console
    console.log('[stub] save', post.title)
    return { _id: post._id ?? `stub-${Date.now()}` }
  },
  async uploadImage(file: File | Blob, meta?: ImageMeta): Promise<SanityImageValue> {
    // Real impl: POST the binary to a server endpoint that uploads the asset.
    // eslint-disable-next-line no-console
    console.log('[stub] uploadImage', file.type, meta)
    return {
      _type: 'image',
      asset: { _type: 'reference', _ref: 'image-stub-1000x1000-jpg' },
      ...(meta ?? {}),
    }
  },
}

// --- STUB AI generate hook ---------------------------------------------------
// Recommended secure path: a hook the host runs server-side so the Anthropic key
// never reaches the browser. Stubbed here to return a fixed draft.
async function generate(brief: string): Promise<GeneratedPost> {
  // Real impl: `await fetch('/api/generate', { method:'POST', body: brief })`.
  return {
    title: `Draft: ${brief.slice(0, 40)}`,
    excerpt: 'A stubbed excerpt illustrating the GeneratedPost shape.',
    body: [
      {
        _key: 'b0',
        _type: 'block',
        style: 'normal',
        markDefs: [],
        children: [{ _key: 'b0s0', _type: 'span', text: 'Stubbed body paragraph.' }],
      },
    ],
  }
}

// --- A host component composing authoring + preview --------------------------
// Mounts <BlogAuthor> for writing and reuses <BlogPostPreview> to render a body.
// `autoPublish` (default true) derives slug + publishedAt on create so the saved
// post reads back via getPostBySlug / getPostList.
const ConsumerApp = defineComponent({
  name: 'ConsumerApp',
  setup() {
    const lastSavedId = ref<string | null>(null)
    const posts = ref<PostListItem[]>([])

    async function refreshList() {
      // In a real app (with CORS configured) this returns published cards.
      posts.value = await getPostList(client)
    }

    function onSaved(result: { _id: string }) {
      lastSavedId.value = result._id
      // Refresh the read-back list after a successful save.
      void refreshList()
    }

    return () =>
      h('div', [
        h(BlogAuthor, {
          adapter,
          generate,
          projectId: PROJECT_ID,
          dataset: DATASET,
          onSaved,
          onError: (msg: string) => {
            // eslint-disable-next-line no-console
            console.error('[BlogAuthor error]', msg)
          },
        }),
        // Standalone preview of an arbitrary body (e.g. a fetched post).
        h(BlogPostPreview, { body: [], projectId: PROJECT_ID, dataset: DATASET }),
      ])
  },
})

// Headless mount so the import + wiring type-checks and runs as a reference.
const host = document.createElement('div')
createApp(ConsumerApp).mount(host)

// Demonstrate the read types are usable too.
export type { Post, PostListItem }

// eslint-disable-next-line no-console
console.log(host.innerHTML)
