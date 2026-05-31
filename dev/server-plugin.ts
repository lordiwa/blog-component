// Dev-only Vite server middleware for the blog-component playground (TASK-008).
//
// =====================================================================
//  SERVER-ONLY. SECRETS LIVE HERE AND NOWHERE ELSE.
// =====================================================================
// This module runs inside the Vite DEV SERVER (Node), never in the browser.
// It is the single place that:
//   - holds the Anthropic API key and the Sanity WRITE token, and
//   - imports the SERVER-ONLY `createReferenceWriteAdapter` + a write client.
// The secrets are passed in by `vite.dev.config.ts` (via loadEnv) and captured
// in this factory's CLOSURE — they are never written to a response body, never
// exposed via `define`, and never reachable from `dev/main.ts`. The browser only
// ever talks to the three JSON endpoints below.
//
// It is NOT part of the library build (vite.config.ts / tsconfig.build.json only
// include `src/`), and it is NOT shipped (package.json `files` ships `dist/`).
//
// Endpoints (all POST, all JSON in / JSON out; errors -> HTTP 500 { error }):
//   POST /api/generate  { brief }            -> GeneratedPost  (Anthropic key)
//   POST /api/save      BlogPostInput        -> { _id }        (Sanity write token)
//                       TASK-011: the slug/publishedAt-on-CREATE logic now lives
//                       in the library (BlogAuthor -> withPublishDefaults), so the
//                       payload arrives prepared and this endpoint just persists it.
//   POST /api/upload    raw image bytes      -> SanityImageValue (Sanity write token)
//                       headers: x-filename, content-type; query: alt/caption/credit/size

import type { Plugin, Connect } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type SanityClient } from '@sanity/client'
import { generatePostBody } from '../src/ai/generatePostBody'
import { createReferenceWriteAdapter } from '../src/sanity/write/reference-adapter'
import type { BlogPostInput, ImageMeta, SanityImageValue } from '../src/sanity/write/adapter'

/** Secrets + public config handed in by vite.dev.config.ts (loadEnv). */
export interface DevServerOptions {
  /** PUBLIC — also exposed to the browser via VITE_. */
  projectId: string
  /** PUBLIC — also exposed to the browser via VITE_. */
  dataset: string
  /** SECRET — Sanity write token (Admin/Editor scope). Server-side only. */
  sanityWriteToken: string
  /** SECRET — Anthropic API key. Server-side only. */
  anthropicApiKey: string
  /**
   * DEV-ONLY model override forwarded to `generatePostBody`. Defaults (in
   * vite.dev.config.ts) to the cheapest current Claude model for the demo;
   * leave the env var blank to fall back to the library's `DEFAULT_AI_MODEL`.
   * When undefined/empty here, no `model` is passed and the library default
   * (sonnet-4-6) applies. The library's shipped default is NOT changed.
   */
  anthropicModel?: string
  /** Pinned Sanity API version for the write client. */
  apiVersion?: string
}

/** Read the whole request body into a Buffer (no multipart dependency). */
function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Parse the request body as JSON. Throws on malformed JSON. */
async function readJson<T>(req: IncomingMessage): Promise<T> {
  const buf = await readBody(req)
  const text = buf.toString('utf8')
  return (text ? JSON.parse(text) : {}) as T
}

/** Send a JSON response with the given status. */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(body)
}

/** Uniform error envelope so the UI can surface server failures. */
function sendError(res: ServerResponse, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  // Log full detail server-side; return only the message to the client.
  // eslint-disable-next-line no-console
  console.error('[dev-server] request failed:', err)
  sendJson(res, 500, { error: message })
}

/**
 * Build the dev playground Vite plugin. The returned plugin installs three
 * middleware endpoints via `configureServer`. All secrets stay in this closure.
 */
export function devServerPlugin(opts: DevServerOptions): Plugin {
  const apiVersion = opts.apiVersion ?? '2024-01-01'

  // The write client + adapter are created lazily and reused. They carry the
  // SECRET token; they exist ONLY in this Node closure. We keep a reference to
  // the raw `writeClient` too: /api/save goes through the reference adapter
  // (unchanged), but /api/upload talks to the client directly so it can pass a
  // Node Buffer with explicit filename/contentType (see that endpoint).
  let writeClient: SanityClient | null = null
  let adapter: ReturnType<typeof createReferenceWriteAdapter> | null = null
  function getWriteClient(): SanityClient {
    if (!writeClient) {
      if (!opts.sanityWriteToken) {
        throw new Error(
          'SANITY_WRITE_TOKEN is not set. Copy .env.example to .env and fill in an Admin/Editor-scoped token.',
        )
      }
      writeClient = createClient({
        projectId: opts.projectId,
        dataset: opts.dataset,
        apiVersion,
        useCdn: false, // REQUIRED for writes — the CDN is read-only.
        token: opts.sanityWriteToken,
      })
    }
    return writeClient
  }
  function getAdapter() {
    if (!adapter) {
      adapter = createReferenceWriteAdapter(getWriteClient())
    }
    return adapter
  }

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? ''
    const method = (req.method ?? 'GET').toUpperCase()

    if (method !== 'POST' || !url.startsWith('/api/')) {
      next()
      return
    }

    // --- POST /api/generate -------------------------------------------------
    if (url.startsWith('/api/generate')) {
      void (async () => {
        try {
          if (!opts.anthropicApiKey) {
            throw new Error(
              'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.',
            )
          }
          const { brief } = await readJson<{ brief?: string }>(req)
          if (!brief || !brief.trim()) {
            throw new Error('`brief` is required.')
          }
          // The key stays in this closure — generatePostBody builds its own
          // Anthropic client from it and never returns it. Forward the dev-only
          // model override (cheapest model for the demo); omit it when blank so
          // the library default applies.
          const post = await generatePostBody(brief, {
            apiKey: opts.anthropicApiKey,
            ...(opts.anthropicModel ? { model: opts.anthropicModel } : {}),
          })
          sendJson(res, 200, post)
        } catch (err) {
          sendError(res, err)
        }
      })()
      return
    }

    // --- POST /api/save -----------------------------------------------------
    if (url.startsWith('/api/save')) {
      void (async () => {
        try {
          const post = await readJson<BlogPostInput>(req)

          // TASK-011: the slug/publishedAt injection on CREATE now lives in the
          // library (BlogAuthor -> withPublishDefaults), so the payload arrives
          // already prepared. This endpoint just persists it.
          const result = await getAdapter().save(post)
          sendJson(res, 200, result)
        } catch (err) {
          sendError(res, err)
        }
      })()
      return
    }

    // --- POST /api/upload ---------------------------------------------------
    if (url.startsWith('/api/upload')) {
      void (async () => {
        try {
          const buffer = await readBody(req)
          if (buffer.length === 0) {
            throw new Error('Empty upload body.')
          }
          const headers = req.headers
          const filename =
            (Array.isArray(headers['x-filename']) ? headers['x-filename'][0] : headers['x-filename']) ??
            'upload'
          const contentType =
            (Array.isArray(headers['content-type']) ? headers['content-type'][0] : headers['content-type']) ??
            'application/octet-stream'

          // Optional image metadata arrives as query params.
          const query = new URL(url, 'http://localhost').searchParams
          const meta: ImageMeta = {}
          const alt = query.get('alt')
          const caption = query.get('caption')
          const credit = query.get('credit')
          const size = query.get('size')
          if (alt) meta.alt = alt
          if (caption) meta.caption = caption
          if (credit) meta.credit = credit
          if (size === 'small' || size === 'medium' || size === 'full') meta.size = size

          // NOTE: we do NOT wrap the bytes in a Node/undici global `File`.
          // @sanity/client's `assets.upload` rejects that object in Node with
          // "Request body must be a string, buffer or stream, got object". The
          // raw Node `Buffer` is an accepted body — so we call the write client
          // DIRECTLY here (the reference adapter only derives the filename from a
          // real `File` and would drop it for a bare Buffer). We then build the
          // exact same `SanityImageValue` attach shape the reference adapter
          // returns: a reference to the asset, with any provided meta copied on.
          const asset = await getWriteClient().assets.upload('image', buffer, {
            filename,
            contentType,
          })
          const value: SanityImageValue = {
            _type: 'image',
            asset: { _type: 'reference', _ref: asset._id },
          }
          if (meta.alt !== undefined) value.alt = meta.alt
          if (meta.caption !== undefined) value.caption = meta.caption
          if (meta.credit !== undefined) value.credit = meta.credit
          if (meta.size !== undefined) value.size = meta.size
          sendJson(res, 200, value)
        } catch (err) {
          sendError(res, err)
        }
      })()
      return
    }

    next()
  }

  return {
    name: 'blog-component-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(handler)
    },
  }
}
