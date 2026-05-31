import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the real Sanity SDK: we never hit the network in unit tests. AC4 (reads
// against a real dataset) is verified manually — see comments in
// src/sanity/client.ts. The factory below records the config passed to
// createClient so we can assert defaults + useCdn without a live project.
//
// `vi.mock` is hoisted to the top of the file, above any top-level `const`, so
// the mock fn must be created inside `vi.hoisted` (also hoisted) — otherwise it
// is in the temporal dead zone when the mock factory runs.
const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn((config: Record<string, unknown>) => ({
    __config: config,
    fetch: vi.fn(),
  })),
}))

vi.mock('@sanity/client', () => ({
  createClient: createClientMock,
}))

import {
  createBlogClient,
  DEFAULT_API_VERSION,
  DEFAULT_DATASET,
} from '../src/sanity/client'

describe('createBlogClient', () => {
  beforeEach(() => {
    createClientMock.mockClear()
  })

  it('passes the consumer projectId through without hardcoding one (AC1)', () => {
    createBlogClient({ projectId: 'abc123' })
    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(createClientMock.mock.calls[0][0]).toMatchObject({ projectId: 'abc123' })
  })

  it('applies sensible dataset/apiVersion defaults (AC1)', () => {
    createBlogClient({ projectId: 'abc123' })
    const config = createClientMock.mock.calls[0][0]
    expect(config.dataset).toBe(DEFAULT_DATASET)
    expect(config.dataset).toBe('production')
    expect(config.apiVersion).toBe(DEFAULT_API_VERSION)
  })

  it('uses the CDN for reads by default', () => {
    createBlogClient({ projectId: 'abc123' })
    expect(createClientMock.mock.calls[0][0].useCdn).toBe(true)
  })

  it('lets the consumer override dataset, apiVersion and useCdn', () => {
    createBlogClient({
      projectId: 'abc123',
      dataset: 'staging',
      apiVersion: '2025-01-01',
      useCdn: false,
    })
    expect(createClientMock.mock.calls[0][0]).toMatchObject({
      projectId: 'abc123',
      dataset: 'staging',
      apiVersion: '2025-01-01',
      useCdn: false,
    })
  })

  it('only forwards a token when one is supplied', () => {
    createBlogClient({ projectId: 'abc123' })
    expect('token' in createClientMock.mock.calls[0][0]).toBe(false)

    createClientMock.mockClear()
    createBlogClient({ projectId: 'abc123', token: 'ro-token' })
    expect(createClientMock.mock.calls[0][0].token).toBe('ro-token')
  })

  it('throws when projectId is missing (no hardcoded fallback, AC1)', () => {
    // @ts-expect-error intentionally invalid config
    expect(() => createBlogClient({})).toThrow(/projectId/)
    // @ts-expect-error intentionally invalid config
    expect(() => createBlogClient(undefined)).toThrow(/projectId/)
  })
})
