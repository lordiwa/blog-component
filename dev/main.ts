// Entry for the local dev playground (TASK-008).
//
// =====================================================================
//  BROWSER CODE — NO SECRETS HERE.
// =====================================================================
// This file runs in the browser. It must NEVER import the write client, the
// reference adapter, or any token. The CLIENT-SIDE `SanityWriteAdapter` below
// implements the same contract `<BlogAuthor>` already depends on, but routes
// `save` / `uploadImage` to the server-side middleware (dev/server-plugin.ts)
// over plain `fetch`. The Anthropic generation is likewise routed to
// `/api/generate`. The only Sanity credentials in the browser are the PUBLIC
// projectId/dataset (import.meta.env), used to build read/image URLs against the
// public dataset (no token).

import { createApp, defineComponent, h, onMounted, ref } from 'vue'
import { createClient } from '@sanity/client'
// Use the NAMED export — the default export of @sanity/image-url is deprecated
// (matches what src/render uses).
import { createImageUrlBuilder } from '@sanity/image-url'

import {
  BlogAuthor,
  BlogPostPreview,
  POST_LIST_QUERY,
  POST_BY_SLUG_QUERY,
  type PostListItem,
  type Post,
  type GeneratedPost,
  type SanityWriteAdapter,
  type BlogPostInput,
  type ImageMeta,
  type SanityImageValue,
} from 'blog-component'

// --- Public config (NO token) -----------------------------------------------
const projectId = import.meta.env.VITE_SANITY_PROJECT_ID as string
const dataset = (import.meta.env.VITE_SANITY_DATASET as string) ?? 'production'

// Read-only public client (no token — the dataset is public).
const readClient = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',
  useCdn: false, // always-fresh so a freshly-saved post shows up immediately.
})

// Image URL builder for the preview (public; no token needed).
const imageBuilder = createImageUrlBuilder(readClient)

// --- Client-side write adapter (routes to the server middleware) -------------
// Same `SanityWriteAdapter` contract `<BlogAuthor>` consumes; the token lives
// only on the server, behind these endpoints.
const adapter: SanityWriteAdapter = {
  async save(post: BlogPostInput): Promise<{ _id: string }> {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(post),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? `save failed (${res.status})`)
    return json as { _id: string }
  },

  async uploadImage(file: File | Blob, meta?: ImageMeta): Promise<SanityImageValue> {
    const params = new URLSearchParams()
    if (meta?.alt) params.set('alt', meta.alt)
    if (meta?.caption) params.set('caption', meta.caption)
    if (meta?.credit) params.set('credit', meta.credit)
    if (meta?.size) params.set('size', meta.size)
    const filename = file instanceof File ? file.name : 'upload'
    const res = await fetch(`/api/upload?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'x-filename': filename,
      },
      body: file,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? `upload failed (${res.status})`)
    return json as SanityImageValue
  },
}

// --- AI generate hook (routes to the server middleware) ----------------------
async function generate(brief: string): Promise<GeneratedPost> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `generate failed (${res.status})`)
  return json as GeneratedPost
}

// --- The playground app: BlogAuthor + a read-back panel ----------------------
const App = defineComponent({
  setup() {
    const posts = ref<PostListItem[]>([])
    const selected = ref<Post | null>(null)
    const listError = ref('')

    async function refreshList() {
      try {
        listError.value = ''
        posts.value = await readClient.fetch<PostListItem[]>(POST_LIST_QUERY)
      } catch (err) {
        listError.value = err instanceof Error ? err.message : String(err)
      }
    }

    async function openPost(slug: string | undefined) {
      if (!slug) return
      try {
        selected.value = await readClient.fetch<Post>(POST_BY_SLUG_QUERY, { slug })
      } catch (err) {
        listError.value = err instanceof Error ? err.message : String(err)
      }
    }

    onMounted(refreshList)

    return () =>
      h('div', [
        // The headline authoring component. Refresh the read-back list on save
        // so a freshly-authored post (TASK-011 round-trip) appears immediately.
        h(BlogAuthor, {
          adapter,
          generate,
          projectId,
          dataset,
          onSaved: (result: { _id: string }) => {
            // eslint-disable-next-line no-console
            console.log('saved', result)
            void refreshList()
          },
          onError: (message: string) => {
            // eslint-disable-next-line no-console
            console.error(message)
          },
        }),

        // --- READ-BACK PANEL ---------------------------------------------------
        h('section', { class: 'playground__panel' }, [
          h('h2', 'Read-back (public dataset)'),
          h('button', { type: 'button', onClick: () => void refreshList() }, 'Refresh list'),
          listError.value ? h('p', { style: 'color:#b00020' }, listError.value) : null,
          posts.value.length === 0
            ? h(
                'p',
                'No posts yet — the dataset starts empty. Author and save a post above to see it here.',
              )
            : h(
                'ul',
                posts.value.map((p) =>
                  h('li', { key: p._id }, [
                    h(
                      'button',
                      { type: 'button', onClick: () => void openPost(p.slug?.current) },
                      p.title ?? '(untitled)',
                    ),
                  ]),
                ),
              ),

          selected.value
            ? h('article', { class: 'playground__panel' }, [
                h('h3', selected.value.title ?? '(untitled)'),
                h(BlogPostPreview, {
                  body: selected.value.body ?? [],
                  imageUrlBuilder: imageBuilder,
                }),
              ])
            : null,
        ]),
      ])
  },
})

createApp(App).mount('#app')
