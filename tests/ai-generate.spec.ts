import { beforeEach, describe, expect, it, vi } from 'vitest'

// AI body generation (TASK-004) unit tests.
//
// We MOCK `@anthropic-ai/sdk` so the suite never hits the network. The test
// asserts the generation path:
//   - the SDK is called with the configured model,
//   - a tool definition + tool_choice are sent (structured output, not free
//     prose parsing),
//   - prompt caching (`cache_control`) is applied to the system prompt,
//   - the API key / client is INJECTED, never hardcoded,
//   - the returned object is shaped `{ title, excerpt, body }` and `body` is a
//     valid PortableText array (blocks with `_type: 'block'`, styled, with
//     keyed `span` children).
//
// `vi.mock` is hoisted above any top-level `const`; the mock fns must therefore
// be created inside `vi.hoisted` (also hoisted) or they sit in the temporal
// dead zone when the mock factory runs (same trap as sanity-client.spec.ts).
const { createMock, AnthropicMock } = vi.hoisted(() => {
  const createMock = vi.fn()
  // The SDK's default export is a class; `new Anthropic({ apiKey })` yields an
  // instance exposing `messages.create`. We record the constructor args so we
  // can assert the key is injected, and the create args for the call shape.
  const AnthropicMock = vi.fn(function (this: Record<string, unknown>, config: unknown) {
    this.__config = config
    this.messages = { create: createMock }
  }) as unknown as { new (config: unknown): unknown } & ReturnType<typeof vi.fn>
  return { createMock, AnthropicMock }
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: AnthropicMock,
}))

import Anthropic from '@anthropic-ai/sdk'
import { generatePostBody, DEFAULT_AI_MODEL } from '../src/ai/generatePostBody'

// A representative `tool_use` response: the model "called" the emit tool with
// structured blocks rather than returning prose.
function toolUseResponse(input: unknown) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_test',
        name: 'emit_post',
        input,
      },
    ],
    usage: { input_tokens: 10, output_tokens: 20 },
  }
}

const SAMPLE_INPUT = {
  title: 'On Slow Mornings',
  excerpt: 'A short ode to coffee and quiet.',
  blocks: [
    { style: 'h2', spans: [{ text: 'The first cup' }] },
    {
      style: 'normal',
      spans: [
        { text: 'Mornings are ' },
        { text: 'better', marks: ['strong'] },
        { text: ' slow.' },
      ],
    },
    { style: 'normal', listItem: 'bullet', level: 1, spans: [{ text: 'Grind fresh.' }] },
  ],
}

describe('generatePostBody', () => {
  beforeEach(() => {
    createMock.mockReset()
    AnthropicMock.mockClear()
    createMock.mockResolvedValue(toolUseResponse(SAMPLE_INPUT))
  })

  it('injects the API key into a constructed client — never hardcoded (AC3)', async () => {
    await generatePostBody('Write about slow mornings.', { apiKey: 'sk-ant-injected' })
    expect(AnthropicMock).toHaveBeenCalledTimes(1)
    expect((AnthropicMock.mock.calls[0][0] as { apiKey: string }).apiKey).toBe('sk-ant-injected')
  })

  it('reuses a host-injected client instance instead of constructing one (AC3)', async () => {
    const create = vi.fn().mockResolvedValue(toolUseResponse(SAMPLE_INPUT))
    const injected = { messages: { create } } as unknown as Anthropic
    await generatePostBody('brief', { client: injected })
    expect(create).toHaveBeenCalledTimes(1)
    // No new client constructed when one is supplied.
    expect(AnthropicMock).not.toHaveBeenCalled()
  })

  it('calls the SDK with the default current Claude model (AC3)', async () => {
    await generatePostBody('brief', { apiKey: 'k' })
    expect(DEFAULT_AI_MODEL).toBe('claude-sonnet-4-6')
    expect(createMock.mock.calls[0][0].model).toBe('claude-sonnet-4-6')
  })

  it('lets the host override the model (e.g. claude-opus-4-8)', async () => {
    await generatePostBody('brief', { apiKey: 'k', model: 'claude-opus-4-8' })
    expect(createMock.mock.calls[0][0].model).toBe('claude-opus-4-8')
  })

  it('sends a forced tool definition for structured output, not free prose (AC1)', async () => {
    await generatePostBody('brief', { apiKey: 'k' })
    const args = createMock.mock.calls[0][0]
    expect(Array.isArray(args.tools)).toBe(true)
    const tool = args.tools.find((t: { name: string }) => t.name === 'emit_post')
    expect(tool).toBeTruthy()
    expect(tool.input_schema.type).toBe('object')
    // The schema describes title/excerpt/blocks so output maps onto PortableText.
    expect(Object.keys(tool.input_schema.properties)).toEqual(
      expect.arrayContaining(['title', 'excerpt', 'blocks']),
    )
    // tool_choice forces the tool so the model cannot answer in prose.
    expect(args.tool_choice).toMatchObject({ type: 'tool', name: 'emit_post' })
  })

  it('applies prompt caching to the system prompt (AC3)', async () => {
    await generatePostBody('brief', { apiKey: 'k' })
    const args = createMock.mock.calls[0][0]
    // System is sent as a block array carrying an ephemeral cache_control marker.
    expect(Array.isArray(args.system)).toBe(true)
    const cached = args.system.find(
      (b: { cache_control?: { type: string } }) => b.cache_control?.type === 'ephemeral',
    )
    expect(cached).toBeTruthy()
  })

  it('passes the user brief through to the messages payload', async () => {
    await generatePostBody('Write about slow mornings.', { apiKey: 'k' })
    const args = createMock.mock.calls[0][0]
    expect(JSON.stringify(args.messages)).toContain('Write about slow mornings.')
  })

  it('returns { title, excerpt, body } mapped from the tool output (AC2)', async () => {
    const result = await generatePostBody('brief', { apiKey: 'k' })
    expect(result.title).toBe('On Slow Mornings')
    expect(result.excerpt).toBe('A short ode to coffee and quiet.')
    expect(Array.isArray(result.body)).toBe(true)
  })

  it('produces valid PortableText blocks the renderer accepts (AC1)', async () => {
    const { body } = await generatePostBody('brief', { apiKey: 'k' })

    // Every block is a standard text block with a unique _key and styled.
    const keys = new Set<string>()
    for (const block of body) {
      expect(block._type).toBe('block')
      expect(typeof block._key).toBe('string')
      expect(block._key.length).toBeGreaterThan(0)
      keys.add(block._key)
      expect(typeof block.style).toBe('string')
      expect(Array.isArray(block.children)).toBe(true)
      for (const span of block.children ?? []) {
        expect(span._type).toBe('span')
        expect(typeof span._key).toBe('string')
        expect(typeof span.text).toBe('string')
      }
    }
    expect(keys.size).toBe(body.length)

    // The heading block kept its style; the second block kept its marks.
    expect(body[0].style).toBe('h2')
    const strongSpan = body[1].children?.find((s) => s.text === 'better')
    expect(strongSpan?.marks).toEqual(['strong'])

    // The list item carried listItem/level through.
    expect(body[2].listItem).toBe('bullet')
    expect(body[2].level).toBe(1)
  })

  it('defaults block style to "normal" when the model omits it', async () => {
    createMock.mockResolvedValue(
      toolUseResponse({
        title: 'T',
        excerpt: 'E',
        blocks: [{ spans: [{ text: 'no style given' }] }],
      }),
    )
    const { body } = await generatePostBody('brief', { apiKey: 'k' })
    expect(body[0].style).toBe('normal')
  })

  it('throws a clear error when neither client nor apiKey is supplied', async () => {
    // `{}` is a valid GeneratePostOptions at the type level (all fields are
    // optional); the rejection is a RUNTIME guard, so no directive is needed.
    await expect(generatePostBody('brief', {})).rejects.toThrow(/apiKey|client/i)
    // @ts-expect-error intentionally missing the required options argument
    await expect(generatePostBody('brief')).rejects.toThrow(/apiKey|client/i)
  })

  it('throws when the model does not return the expected tool call', async () => {
    createMock.mockResolvedValue({
      ...toolUseResponse(SAMPLE_INPUT),
      content: [{ type: 'text', text: 'sorry, here is prose instead' }],
    })
    await expect(generatePostBody('brief', { apiKey: 'k' })).rejects.toThrow(/tool|emit_post/i)
  })

  // Hardening: the tool MAY be called yet return malformed input. The LLM output
  // is untrusted, so a degenerate shape must fail loudly with a clear error
  // rather than resolve to { title: undefined, ... } / silent empties.
  it('throws a clear error when the tool returns no title', async () => {
    createMock.mockResolvedValue(
      toolUseResponse({ excerpt: 'E', blocks: [{ spans: [{ text: 'x' }] }] }),
    )
    await expect(generatePostBody('brief', { apiKey: 'k' })).rejects.toThrow(/malformed|title/i)
  })

  it('throws a clear error when the tool returns an empty title', async () => {
    createMock.mockResolvedValue(
      toolUseResponse({ title: '   ', excerpt: 'E', blocks: [{ spans: [{ text: 'x' }] }] }),
    )
    await expect(generatePostBody('brief', { apiKey: 'k' })).rejects.toThrow(/malformed|title/i)
  })

  it('throws a clear error when the tool returns no excerpt', async () => {
    createMock.mockResolvedValue(
      toolUseResponse({ title: 'T', blocks: [{ spans: [{ text: 'x' }] }] }),
    )
    await expect(generatePostBody('brief', { apiKey: 'k' })).rejects.toThrow(/malformed|excerpt/i)
  })

  it('throws a clear error when `blocks` is not an array', async () => {
    createMock.mockResolvedValue(
      toolUseResponse({ title: 'T', excerpt: 'E', blocks: 'not-an-array' }),
    )
    await expect(generatePostBody('brief', { apiKey: 'k' })).rejects.toThrow(/malformed|blocks/i)
  })
})
