// Unit tests for `withPublishDefaults` (TASK-011, library level).
//
// The product decision is: on CREATE (no `_id`), auto-derive `slug` from the
// title (via the existing slugify) and set `publishedAt = now`, UNLESS the host
// already supplied them; on UPDATE (existing `_id`), never inject anything.
// This pins that contract so the TASK-002 read queries can always find a
// freshly-created post (POST_BY_SLUG_QUERY matches slug.current; POST_LIST_QUERY
// requires a past publishedAt). Written FIRST (red), then implemented to green.

import { describe, expect, it } from 'vitest'
import { withPublishDefaults } from '../src/sanity/write/publish'
import type { BlogPostInput } from '../src/sanity/write/adapter'

const NOW = '2026-05-30T12:00:00.000Z'

describe('withPublishDefaults', () => {
  it('on CREATE derives slug from title and sets publishedAt to options.now', () => {
    const post: BlogPostInput = { title: 'Cómo Programar' }
    const result = withPublishDefaults(post, { now: NOW })

    expect(result.slug).toEqual({ _type: 'slug', current: 'como-programar' })
    expect(result.publishedAt).toBe(NOW)
  })

  it('on CREATE preserves an already-present slug untouched', () => {
    const existingSlug = { _type: 'slug', current: 'host-chosen-slug' }
    const post: BlogPostInput = { title: 'Cómo Programar', slug: existingSlug }
    const result = withPublishDefaults(post, { now: NOW })

    expect(result.slug).toEqual(existingSlug)
    expect(result.publishedAt).toBe(NOW)
  })

  it('on CREATE preserves an already-present publishedAt untouched', () => {
    const post: BlogPostInput = {
      title: 'Cómo Programar',
      publishedAt: '2020-01-01T00:00:00.000Z',
    }
    const result = withPublishDefaults(post, { now: NOW })

    expect(result.publishedAt).toBe('2020-01-01T00:00:00.000Z')
    // slug still derived since it was absent.
    expect(result.slug).toEqual({ _type: 'slug', current: 'como-programar' })
  })

  it('on CREATE treats an empty-string publishedAt as absent and stamps now', () => {
    // An empty/whitespace `publishedAt` would fail the read query's
    // `defined(publishedAt) && publishedAt <= now()` filter, hiding the post —
    // so it must be replaced with a real timestamp, not preserved verbatim.
    const empty: BlogPostInput = { title: 'Cómo Programar', publishedAt: '' }
    expect(withPublishDefaults(empty, { now: NOW }).publishedAt).toBe(NOW)

    const whitespace: BlogPostInput = { title: 'Cómo Programar', publishedAt: '   ' }
    expect(withPublishDefaults(whitespace, { now: NOW }).publishedAt).toBe(NOW)
  })

  it('on UPDATE (post._id present) injects nothing', () => {
    const post: BlogPostInput = { _id: 'post-existing-1', title: 'Cómo Programar' }
    const result = withPublishDefaults(post, { now: NOW })

    expect('slug' in result).toBe(false)
    expect('publishedAt' in result).toBe(false)
    expect(result._id).toBe('post-existing-1')
    expect(result.title).toBe('Cómo Programar')
  })

  it('on CREATE with empty/whitespace title does NOT set slug but still sets publishedAt', () => {
    const post: BlogPostInput = { title: '   ' }
    const result = withPublishDefaults(post, { now: NOW })

    expect('slug' in result).toBe(false)
    expect(result.publishedAt).toBe(NOW)
  })

  it('on CREATE with a title that slugifies to empty does NOT set slug', () => {
    const post: BlogPostInput = { title: '!!!' }
    const result = withPublishDefaults(post, { now: NOW })

    expect('slug' in result).toBe(false)
    expect(result.publishedAt).toBe(NOW)
  })

  it('does not mutate the input (returns a new object)', () => {
    const post: BlogPostInput = { title: 'Cómo Programar' }
    const result = withPublishDefaults(post, { now: NOW })

    expect(result).not.toBe(post)
    expect('slug' in post).toBe(false)
    expect('publishedAt' in post).toBe(false)
  })

  it('when options.now is omitted, publishedAt is a parseable ISO string that is not future-dated', () => {
    const before = Date.now()
    const post: BlogPostInput = { title: 'Cómo Programar' }
    const result = withPublishDefaults(post)
    const after = Date.now()

    expect(typeof result.publishedAt).toBe('string')
    expect((result.publishedAt as string).length).toBeGreaterThan(0)
    const stamped = Date.parse(result.publishedAt as string)
    expect(Number.isNaN(stamped)).toBe(false)
    // Read-back visibility is the whole point: the stamp must be <= now (not
    // future-dated, or POST_LIST_QUERY's `publishedAt <= now()` would hide it).
    expect(stamped).toBeLessThanOrEqual(after)
    expect(stamped).toBeGreaterThanOrEqual(before)
  })
})
