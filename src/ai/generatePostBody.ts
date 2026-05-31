// AI body generation for the blog-component (TASK-004).
//
// Given a free-form brief, call the Claude API and produce a well-formed Sanity
// PortableText body plus a suggested title and excerpt. The model returns its
// answer through a FORCED tool call (structured output) so the result maps
// cleanly onto the `blockContent` schema from TASK-002 — we never free-parse
// prose into blocks.
//
// SECURITY / config (mirrors the Sanity write-token rule in
// blog-implementation-guide.md problem #1): the Anthropic API key is a SECRET
// and does NOT belong in the browser bundle. This component is key-agnostic.
// The host injects credentials one of two ways:
//   1. `client`  — a pre-configured `Anthropic` instance (or anything exposing
//      `messages.create`). Use this to run the call from YOUR backend / a
//      signing proxy, so the key never ships to the client.
//   2. `apiKey`  — a key the component uses to construct a client on the fly.
//      Only pass this where the code already runs server-side; do NOT embed a
//      real key in client JS.
// Nothing is hardcoded; with neither option supplied the call throws.
//
// `@anthropic-ai/sdk` is a runtime dependency declared in `dependencies` and
// marked `external` in vite.config.ts, so it is NOT bundled into the library —
// consumers install it transitively (same treatment as `@sanity/client`).

import Anthropic from '@anthropic-ai/sdk'
import type { BlockContent, PortableTextBlock, PortableTextSpan } from '../sanity/types'

/**
 * Default Claude model. A current model id; the host can override it with any
 * other (e.g. `'claude-opus-4-8'`) via {@link GeneratePostOptions.model}.
 */
export const DEFAULT_AI_MODEL = 'claude-sonnet-4-6'

/** Internal tool name the model is forced to call. */
const EMIT_TOOL_NAME = 'emit_post'

/**
 * Options for {@link generatePostBody}. Supply EITHER a pre-built `client`
 * (preferred — lets the call run from your backend) OR an `apiKey` for the
 * component to build one. Never hardcode the key into client-side code.
 */
export interface GeneratePostOptions {
  /**
   * A pre-configured Anthropic client (or any object exposing a compatible
   * `messages.create`). When supplied, `apiKey` is ignored and no client is
   * constructed — ideal for routing the call through a server/proxy.
   */
  client?: Anthropic
  /**
   * Anthropic API key used to construct a client when `client` is omitted.
   * SECRET — only pass this server-side. Mutually sufficient with `client`.
   */
  apiKey?: string
  /** Claude model id. Defaults to {@link DEFAULT_AI_MODEL}. */
  model?: string
  /** Max tokens for the completion. Defaults to a generous body budget. */
  maxTokens?: number
  /**
   * Extra steering appended to the system prompt (tone, audience, length).
   * Kept separate from the cached base prompt so caching still hits.
   */
  guidance?: string
}

/** The shape {@link generatePostBody} resolves to. */
export interface GeneratedPost {
  /** Suggested post title, mapped to the `post.title` field. */
  title: string
  /** Suggested excerpt, mapped to the `post.excerpt` field. */
  excerpt: string
  /** PortableText body, ready to drop into `post.body` (reuses BlockContent). */
  body: BlockContent
}

// --- Structured-output contract --------------------------------------------
// The model answers by calling `emit_post` with this JSON. It is intentionally
// a SIMPLIFIED projection of PortableText: the model supplies styles/marks/
// spans, and we add the Sanity bookkeeping (`_type`, `_key`) deterministically.
// This keeps the model from having to invent stable `_key`s and guarantees the
// blocks pass the TASK-003 renderer without unknown-type warnings.

interface ToolSpan {
  text: string
  marks?: string[]
}

interface ToolBlock {
  style?: string
  listItem?: 'bullet' | 'number'
  level?: number
  spans: ToolSpan[]
}

interface ToolOutput {
  title: string
  excerpt: string
  blocks: ToolBlock[]
}

/**
 * The Anthropic tool definition. Forcing this tool (via `tool_choice`) makes the
 * model emit structured blocks instead of prose. Styles/marks are restricted to
 * what the documented schema renders (h2/lead/pullquote/blockquote + strong/em).
 */
const EMIT_TOOL: Anthropic.Tool = {
  name: EMIT_TOOL_NAME,
  description:
    'Return the drafted blog post as structured PortableText-ready blocks, plus a title and excerpt. Always call this tool; never answer in prose.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Concise, compelling post title.' },
      excerpt: {
        type: 'string',
        description: 'One- to two-sentence summary for cards and meta description.',
      },
      blocks: {
        type: 'array',
        description: 'The post body, in reading order.',
        items: {
          type: 'object',
          properties: {
            style: {
              type: 'string',
              enum: ['normal', 'h2', 'h3', 'h4', 'blockquote', 'lead', 'pullquote'],
              description: 'Block style. Defaults to "normal" if omitted.',
            },
            listItem: {
              type: 'string',
              enum: ['bullet', 'number'],
              description: 'Set only for list items.',
            },
            level: { type: 'number', description: 'List nesting level (1-based).' },
            spans: {
              type: 'array',
              description: 'Inline text runs making up the block.',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  marks: {
                    type: 'array',
                    items: { type: 'string', enum: ['strong', 'em', 'code', 'underline'] },
                    description: 'Inline decorators applied to this run.',
                  },
                },
                required: ['text'],
              },
            },
          },
          required: ['spans'],
        },
      },
    },
    required: ['title', 'excerpt', 'blocks'],
  },
}

const BASE_SYSTEM_PROMPT = [
  'You are an expert blog editor that drafts posts as structured content.',
  'You write clear, engaging, well-structured prose with sensible headings and short paragraphs.',
  'You ALWAYS respond by calling the `emit_post` tool with title, excerpt, and body blocks.',
  'Use only the provided block styles and inline marks. Do not invent fields, do not output images,',
  'and do not answer in plain prose. The body must read as a complete, publishable post.',
].join(' ')

/**
 * Generate a blog post body (PortableText) plus title/excerpt from a brief.
 *
 * @param brief Free-form description of what the post should cover.
 * @param opts  Credentials + model config. Supply `client` or `apiKey`.
 * @throws if neither `client` nor `apiKey` is supplied, or if the model fails
 *         to return the forced `emit_post` tool call.
 */
export async function generatePostBody(
  brief: string,
  opts: GeneratePostOptions,
): Promise<GeneratedPost> {
  if (!opts || (!opts.client && !opts.apiKey)) {
    throw new Error(
      'generatePostBody: supply either a configured `client` or an `apiKey`. The component never hardcodes an Anthropic key; like the Sanity write token, it belongs server-side.',
    )
  }

  const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey })
  const model = opts.model ?? DEFAULT_AI_MODEL
  const maxTokens = opts.maxTokens ?? 4096

  // Prompt caching: the long, stable base prompt is sent as a system block with
  // an ephemeral `cache_control` marker so repeated generations reuse the cached
  // prefix (per the claude-api skill). Per-request `guidance` goes in its own,
  // uncached block so it can vary without busting the cache.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: BASE_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ]
  if (opts.guidance) {
    system.push({ type: 'text', text: opts.guidance })
  }

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    tools: [EMIT_TOOL],
    // Force the structured tool so the model cannot drift into prose.
    tool_choice: { type: 'tool', name: EMIT_TOOL_NAME },
    messages: [{ role: 'user', content: brief }],
  })

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === 'tool_use' && block.name === EMIT_TOOL_NAME,
  )
  if (!toolUse) {
    throw new Error(
      `generatePostBody: model did not return the expected \`${EMIT_TOOL_NAME}\` tool call.`,
    )
  }

  const output = validateToolOutput(toolUse.input)
  return {
    title: output.title,
    excerpt: output.excerpt,
    body: toPortableText(output.blocks),
  }
}

/**
 * Runtime guard for the forced-tool result. The model's output is untrusted: a
 * degenerate response (missing title/excerpt, or `blocks` not an array) must
 * fail loudly here rather than surface as `undefined`/silent empties
 * downstream. Mirrors the "did not return a tool call" error style.
 */
function validateToolOutput(input: unknown): ToolOutput {
  const fail = (reason: string): never => {
    throw new Error(
      `generatePostBody: \`${EMIT_TOOL_NAME}\` returned a malformed result (${reason}).`,
    )
  }

  if (typeof input !== 'object' || input === null) {
    return fail('expected an object')
  }
  const candidate = input as Record<string, unknown>

  if (typeof candidate.title !== 'string' || candidate.title.trim() === '') {
    return fail('missing or empty `title`')
  }
  if (typeof candidate.excerpt !== 'string' || candidate.excerpt.trim() === '') {
    return fail('missing or empty `excerpt`')
  }
  if (!Array.isArray(candidate.blocks)) {
    return fail('`blocks` is not an array')
  }

  return candidate as unknown as ToolOutput
}

// --- Mapping ----------------------------------------------------------------

/**
 * Map the model's simplified blocks onto valid PortableText. We add the Sanity
 * bookkeeping the renderer requires (`_type: 'block'` / `'span'`, stable `_key`s,
 * a default `style`) so the result drops straight into `post.body`.
 */
function toPortableText(blocks: ToolBlock[]): BlockContent {
  return (blocks ?? []).map((block, blockIndex): PortableTextBlock => {
    const children: PortableTextSpan[] = (block.spans ?? []).map((span, spanIndex) => {
      const out: PortableTextSpan = {
        _key: `b${blockIndex}s${spanIndex}`,
        _type: 'span',
        text: span.text ?? '',
      }
      if (span.marks && span.marks.length > 0) {
        out.marks = span.marks
      }
      return out
    })

    const out: PortableTextBlock = {
      _key: `b${blockIndex}`,
      _type: 'block',
      style: block.style ?? 'normal',
      children,
      markDefs: [],
    }
    if (block.listItem) {
      out.listItem = block.listItem
      out.level = block.level ?? 1
    }
    return out
  })
}
