// Tests for read-path error normalization + scheduling policy (TASK-010).
//
// AC1: raw @sanity/client rejections must be normalized to a typed
// `BlogReadError` (preserving the original as `cause`, with `operation`/`slug`).
// AC2: getPostBySlug defaults to the AIRTIGHT query (publishedAt <= now()) and
// switches to the PREVIEW query only when `allowUnpublished: true`.
// Written FIRST (red), then implemented to green. Mirrors the fake-client
// mocking style in tests/sanity-posts.spec.ts.

import { describe, expect, it, vi } from 'vitest'
import type { SanityClient } from '@sanity/client'
import { getPostBySlug, getPostList } from '../src/sanity/posts'
import {
  POST_BY_SLUG_QUERY,
  POST_BY_SLUG_PREVIEW_QUERY,
} from '../src/sanity/queries'
import { BlogReadError, isBlogReadError } from '../src/sanity/read-error'

function makeFetchingClient(impl: () => unknown) {
  const fetch = vi.fn().mockImplementation(impl)
  return { client: { fetch } as unknown as SanityClient, fetch }
}

function makeRejectingClient(err: unknown) {
  const fetch = vi.fn().mockRejectedValue(err)
  return { client: { fetch } as unknown as SanityClient, fetch }
}

describe('BlogReadError (AC1)', () => {
  it('getPostList wraps a fetch rejection as a BlogReadError preserving cause + operation', async () => {
    const original = new Error('CORS / network blew up')
    const { client } = makeRejectingClient(original)

    const thrown = await getPostList(client).then(
      () => null,
      (e) => e as unknown,
    )

    expect(thrown).toBeInstanceOf(BlogReadError)
    const err = thrown as BlogReadError
    expect(err.name).toBe('BlogReadError')
    expect(err.cause).toBe(original)
    expect(err.operation).toBe('getPostList')
    expect(isBlogReadError(err)).toBe(true)
  })

  it('getPostBySlug wraps a fetch rejection as a BlogReadError with operation + slug', async () => {
    const original = new Error('403 unauthorized')
    const { client } = makeRejectingClient(original)

    const thrown = await getPostBySlug(client, 'my-post').then(
      () => null,
      (e) => e as unknown,
    )

    expect(thrown).toBeInstanceOf(BlogReadError)
    const err = thrown as BlogReadError
    expect(err.cause).toBe(original)
    expect(err.operation).toBe('getPostBySlug')
    expect(err.slug).toBe('my-post')
  })

  it('isBlogReadError rejects non-BlogReadError values', () => {
    expect(isBlogReadError(new Error('plain'))).toBe(false)
    expect(isBlogReadError(null)).toBe(false)
    expect(isBlogReadError({ name: 'BlogReadError' })).toBe(false)
  })

  it('happy paths still resolve unchanged (no wrapping on success)', async () => {
    const list = makeFetchingClient(() => [])
    await expect(getPostList(list.client)).resolves.toEqual([])

    const detail = makeFetchingClient(() => null)
    await expect(getPostBySlug(detail.client, 'x')).resolves.toBeNull()
  })
})

describe('getPostBySlug scheduling policy (AC2)', () => {
  it('uses the AIRTIGHT query by default (no options)', async () => {
    const { client, fetch } = makeFetchingClient(() => null)
    await getPostBySlug(client, 'my-post')
    expect(fetch).toHaveBeenCalledWith(POST_BY_SLUG_QUERY, { slug: 'my-post' })
    // The airtight query must carry the publish filter.
    expect(POST_BY_SLUG_QUERY).toContain('defined(publishedAt) && publishedAt <= now()')
  })

  it('uses the AIRTIGHT query when allowUnpublished is false', async () => {
    const { client, fetch } = makeFetchingClient(() => null)
    await getPostBySlug(client, 'my-post', { allowUnpublished: false })
    expect(fetch).toHaveBeenCalledWith(POST_BY_SLUG_QUERY, { slug: 'my-post' })
  })

  it('uses the PREVIEW query when allowUnpublished is true', async () => {
    const { client, fetch } = makeFetchingClient(() => null)
    await getPostBySlug(client, 'my-post', { allowUnpublished: true })
    expect(fetch).toHaveBeenCalledWith(POST_BY_SLUG_PREVIEW_QUERY, { slug: 'my-post' })
    // The preview query must NOT carry the publish filter (reaches scheduled posts).
    expect(POST_BY_SLUG_PREVIEW_QUERY).not.toContain('publishedAt <= now()')
  })
})

describe('null-tolerant body (AC3)', () => {
  it('both detail queries coalesce an absent body to []', () => {
    expect(POST_BY_SLUG_QUERY).toContain('coalesce(body[]{')
    expect(POST_BY_SLUG_QUERY).toContain('}, [])')
    expect(POST_BY_SLUG_PREVIEW_QUERY).toContain('coalesce(body[]{')
    expect(POST_BY_SLUG_PREVIEW_QUERY).toContain('}, [])')
  })
})

describe('public API exports (TASK-010 additions)', () => {
  it('re-exports BlogReadError, isBlogReadError, and the preview query', async () => {
    const pkg = await import('../src')
    expect(pkg.BlogReadError).toBe(BlogReadError)
    expect(typeof pkg.isBlogReadError).toBe('function')
    expect(pkg.POST_BY_SLUG_PREVIEW_QUERY).toBe(POST_BY_SLUG_PREVIEW_QUERY)
  })
})
