// Unit tests for the `slugify` helper (TASK-011).
//
// `slugify` is the one piece of REAL, reusable logic behind the dev playground:
// when a NEW post is created without a slug, the save path must mint a
// URL-safe `slug.current` from the title so the TASK-002 read queries
// (`POST_BY_SLUG_QUERY` matches on `slug.current`) can find it again. It lives
// in the published library at `src/sanity/write/slugify.ts` and is imported by
// both the dev server middleware and any host that wants the same behavior.
//
// These tests are written FIRST (red), then the implementation makes them pass.
// They pin the exact normalization contract so the round-trip stays stable:
//   - lowercasing
//   - accent / diacritic stripping (Unicode NFD + combining-mark removal)
//   - any run of non-alphanumeric chars collapses to a single hyphen
//   - repeated hyphens collapse to one
//   - leading / trailing hyphens are trimmed
//   - the result is capped at `maxLength` (default 96) WITHOUT leaving a
//     trailing hyphen after truncation.

import { describe, expect, it } from 'vitest'
import { slugify } from '../src/sanity/write/slugify'

describe('slugify', () => {
  it('lowercases the title', () => {
    expect(slugify('Hello World')).toBe('hello-world')
    expect(slugify('ALL CAPS TITLE')).toBe('all-caps-title')
  })

  it('strips accents and diacritics (Spanish example)', () => {
    expect(slugify('Cómo programar en Español')).toBe('como-programar-en-espanol')
  })

  it('strips a range of common diacritics', () => {
    expect(slugify('Crème Brûlée à la Niçoise')).toBe('creme-brulee-a-la-nicoise')
    // NFD decomposes ü → u + combining mark (stripped); the eszett 'ß' has no
    // ASCII decomposition, so it is treated as a non-alphanumeric separator.
    expect(slugify('Über die Brücke')).toBe('uber-die-brucke')
  })

  it('replaces any run of non-alphanumeric characters with a single hyphen', () => {
    expect(slugify('foo & bar / baz')).toBe('foo-bar-baz')
    expect(slugify('a.b,c;d:e')).toBe('a-b-c-d-e')
    expect(slugify('hello   world')).toBe('hello-world')
  })

  it('collapses repeated hyphens into one', () => {
    expect(slugify('hello---world')).toBe('hello-world')
    expect(slugify('a -- b -- c')).toBe('a-b-c')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world')
    expect(slugify('---edge---')).toBe('edge')
    expect(slugify('!!!bang!!!')).toBe('bang')
  })

  it('keeps digits', () => {
    expect(slugify('Top 10 Tips for 2026')).toBe('top-10-tips-for-2026')
  })

  it('returns an empty string when there is nothing slug-able', () => {
    expect(slugify('')).toBe('')
    expect(slugify('   ')).toBe('')
    expect(slugify('!!!')).toBe('')
  })

  it('caps the result at the default maxLength of 96 characters', () => {
    const longTitle = 'word '.repeat(60).trim() // ~300 chars of "word word word ..."
    const result = slugify(longTitle)
    expect(result.length).toBeLessThanOrEqual(96)
  })

  it('does not leave a trailing hyphen after truncation', () => {
    // Build a title whose 96-char prefix would naturally fall ON a hyphen
    // boundary, so a naive `slice(0, 96)` would leave a dangling '-'.
    // "aaaa-aaaa-..." groups of 4 letters joined by hyphens; char 96 lands on '-'.
    const title = Array.from({ length: 30 }, () => 'aaaa').join(' ')
    const result = slugify(title)
    expect(result.length).toBeLessThanOrEqual(96)
    expect(result.endsWith('-')).toBe(false)
  })

  it('honors a custom maxLength and still trims a dangling hyphen', () => {
    // maxLength 8 cuts "hello-world" mid-token at "hello-wo"; with a boundary
    // case the trailing hyphen must be removed.
    expect(slugify('hello world', 6)).toBe('hello')
    expect(slugify('ab cd ef gh', 5)).toBe('ab-cd')
    // A maxLength that lands exactly on a hyphen must not keep it.
    expect(slugify('ab cd ef', 3).endsWith('-')).toBe(false)
  })
})
