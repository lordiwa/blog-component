import { describe, expect, it, vi } from 'vitest'
import type { SanityClient } from '@sanity/client'
import { getPostBySlug, getPostList } from '../src/sanity/posts'
import { POST_BY_SLUG_QUERY, POST_LIST_QUERY } from '../src/sanity/queries'
import type { Post, PostListItem } from '../src/sanity/types'

// A minimal fake SanityClient exposing only `fetch`, the method our read
// functions use. We assert the exact GROQ string + params handed to it.
function makeClient(resolved: unknown) {
  const fetch = vi.fn().mockResolvedValue(resolved)
  return { client: { fetch } as unknown as SanityClient, fetch }
}

describe('getPostList', () => {
  it('fetches the LIST query with no params', async () => {
    const { client, fetch } = makeClient([])
    await getPostList(client)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(POST_LIST_QUERY)
  })

  it('uses a list query that omits the body but derives bodyCharCount, filters and orders (AC2-ish)', () => {
    // No full body projection in the listing.
    expect(POST_LIST_QUERY).not.toMatch(/body\[\]/)
    expect(POST_LIST_QUERY).toContain('"bodyCharCount": coalesce(length(pt::text(body)), 0)')
    expect(POST_LIST_QUERY).toContain('defined(publishedAt) && publishedAt <= now()')
    expect(POST_LIST_QUERY).toContain('order(featured desc, publishedAt desc)')
    expect(POST_LIST_QUERY).toContain('author->{name, image}')
  })

  it('returns the typed list result', async () => {
    const item: PostListItem = {
      _id: 'p1',
      title: 'Hello',
      slug: { current: 'hello' },
      publishedAt: '2024-01-01T00:00:00Z',
      author: { name: 'Ada' },
      bodyCharCount: 42,
    }
    const { client } = makeClient([item])
    const result = await getPostList(client)
    expect(result[0].bodyCharCount).toBe(42)
    expect(result[0].author?.name).toBe('Ada')
  })
})

describe('getPostBySlug', () => {
  it('fetches the DETAIL query passing the slug as a param', async () => {
    const { client, fetch } = makeClient(null)
    await getPostBySlug(client, 'my-post')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(POST_BY_SLUG_QUERY, { slug: 'my-post' })
  })

  it('uses a detail query that expands author, body, and resolves internalLink slugs (AC2)', () => {
    expect(POST_BY_SLUG_QUERY).toContain('slug.current == $slug')
    expect(POST_BY_SLUG_QUERY).toContain('author->{name, image}')
    expect(POST_BY_SLUG_QUERY).toContain('body[]{')
    expect(POST_BY_SLUG_QUERY).toContain('markDefs[]{')
    expect(POST_BY_SLUG_QUERY).toContain('_type == "internalLink"')
    expect(POST_BY_SLUG_QUERY).toContain('@.reference->slug.current')
  })

  it('returns the typed post (body, author, resolved internalLink slug) (AC2/AC3)', async () => {
    const post: Post = {
      _id: 'p1',
      title: 'Hello',
      slug: { current: 'hello' },
      publishedAt: '2024-01-01T00:00:00Z',
      author: { name: 'Ada' },
      body: [
        {
          _key: 'b1',
          _type: 'block',
          children: [{ _key: 's1', _type: 'span', text: 'see this', marks: ['m1'] }],
          markDefs: [{ _key: 'm1', _type: 'internalLink', slug: 'other-post' }],
        },
      ],
    }
    const { client } = makeClient(post)
    const result = await getPostBySlug(client, 'hello')
    expect(result).not.toBeNull()
    expect(result?.author?.name).toBe('Ada')
    expect(result?.body[0].markDefs?.[0].slug).toBe('other-post')
  })

  it('resolves to null when no post matches', async () => {
    const { client } = makeClient(null)
    expect(await getPostBySlug(client, 'missing')).toBeNull()
  })
})

describe('public API exports', () => {
  it('re-exports the read path from the package entry point', async () => {
    const pkg = await import('../src')
    expect(typeof pkg.createBlogClient).toBe('function')
    expect(typeof pkg.getPostList).toBe('function')
    expect(typeof pkg.getPostBySlug).toBe('function')
    expect(pkg.POST_LIST_QUERY).toBe(POST_LIST_QUERY)
    expect(pkg.POST_BY_SLUG_QUERY).toBe(POST_BY_SLUG_QUERY)
  })
})
