import { describe, expect, it, vi } from 'vitest'
import type { SanityClient } from '@sanity/client'
import {
  createReferenceWriteAdapter,
  DEFAULT_POST_TYPE,
} from '../src/sanity/write/reference-adapter'
import type {
  BlogPostInput,
  SanityImageValue,
  SanityWriteAdapter,
} from '../src/sanity/write/adapter'

// A fake write-capable Sanity client. We only stub the surface the reference
// adapter touches: `create`, `patch().set().commit()`, and `assets.upload`.
// No real network. Returns let us assert what the adapter passes through.
function makeWriteClient(opts?: {
  createId?: string
  patchId?: string
  assetId?: string
}) {
  const createId = opts?.createId ?? 'post-created-1'
  const patchId = opts?.patchId ?? 'post-existing-1'
  const assetId = opts?.assetId ?? 'image-abc123-2000x1500-jpg'

  const create = vi.fn().mockResolvedValue({ _id: createId, _rev: 'r1' })

  const commit = vi.fn().mockResolvedValue({ _id: patchId, _rev: 'r2' })
  // Type `set`'s parameter so `set.mock.calls[i][0]` (the patched fields) is a
  // record rather than the empty tuple `[]`. The adapter calls `.set(fields)`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const set = vi.fn((_fields: Record<string, unknown>) => ({ commit }))
  const patch = vi.fn(() => ({ set }))

  const upload = vi.fn().mockResolvedValue({
    _id: assetId,
    _type: 'sanity.imageAsset',
    url: `https://cdn.example/${assetId}`,
  })

  const client = {
    create,
    patch,
    assets: { upload },
  } as unknown as SanityClient

  return { client, create, patch, set, commit, upload, createId, patchId, assetId }
}

describe('createReferenceWriteAdapter — save()', () => {
  it('CREATEs a post (no _id) via client.create with _type defaulted to "post" and returns { _id } (AC2/AC3)', async () => {
    const f = makeWriteClient({ createId: 'post-new-9' })
    const adapter = createReferenceWriteAdapter(f.client)

    const result = await adapter.save({
      title: 'Hello world',
      slug: { _type: 'slug', current: 'hello-world' },
      body: [],
    })

    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.patch).not.toHaveBeenCalled()
    const [doc, options] = f.create.mock.calls[0]
    expect(doc._type).toBe(DEFAULT_POST_TYPE)
    expect(doc.title).toBe('Hello world')
    // _id must not be sent on create — Sanity assigns it.
    expect(doc._id).toBeUndefined()
    // Array items (PT blocks) need keys.
    expect(options).toEqual({ autoGenerateArrayKeys: true })
    expect(result).toEqual({ _id: 'post-new-9' })
  })

  it('honors an explicit _type on create', async () => {
    const f = makeWriteClient()
    const adapter = createReferenceWriteAdapter(f.client)
    await adapter.save({ _type: 'article', title: 'X' } as BlogPostInput)
    expect(f.create.mock.calls[0][0]._type).toBe('article')
  })

  it('UPDATEs an existing post (has _id) via patch().set().commit() and returns { _id } (AC3 round-trip)', async () => {
    const f = makeWriteClient({ patchId: 'post-existing-7' })
    const adapter = createReferenceWriteAdapter(f.client)

    const result = await adapter.save({
      _id: 'post-existing-7',
      title: 'Updated title',
      body: [{ _key: 'b1', _type: 'block' }],
    })

    expect(f.create).not.toHaveBeenCalled()
    expect(f.patch).toHaveBeenCalledWith('post-existing-7')
    // The patched fields must NOT include _id / _type control fields.
    const setArg = f.set.mock.calls[0][0]
    expect(setArg.title).toBe('Updated title')
    expect(setArg._id).toBeUndefined()
    expect(setArg._type).toBeUndefined()
    expect(f.commit).toHaveBeenCalledWith({ autoGenerateArrayKeys: true })
    expect(result).toEqual({ _id: 'post-existing-7' })
  })

  it('round-trips create then update against the same fake store', async () => {
    const f = makeWriteClient({ createId: 'post-rt-1', patchId: 'post-rt-1' })
    const adapter = createReferenceWriteAdapter(f.client)

    const created = await adapter.save({ title: 'v1', body: [] })
    expect(created._id).toBe('post-rt-1')

    const updated = await adapter.save({ _id: created._id, title: 'v2', body: [] })
    expect(updated._id).toBe('post-rt-1')
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.patch).toHaveBeenCalledTimes(1)
  })
})

describe('createReferenceWriteAdapter — uploadImage()', () => {
  it('uploads via assets.upload("image", file, ...) and returns the correct SanityImageValue reference shape (AC2)', async () => {
    const f = makeWriteClient({ assetId: 'image-xyz-800x600-png' })
    const adapter = createReferenceWriteAdapter(f.client)

    const blob = new Blob(['fake-bytes'], { type: 'image/png' })
    const value = await adapter.uploadImage(blob, {
      alt: 'A cat',
      caption: 'Golden hour',
      credit: 'Photo: Jane Doe',
      size: 'full',
    })

    expect(f.upload).toHaveBeenCalledTimes(1)
    const [assetType, passedFile, uploadOpts] = f.upload.mock.calls[0]
    expect(assetType).toBe('image')
    expect(passedFile).toBe(blob)
    expect(uploadOpts).toMatchObject({ contentType: 'image/png' })

    const expected: SanityImageValue = {
      _type: 'image',
      asset: { _type: 'reference', _ref: 'image-xyz-800x600-png' },
      alt: 'A cat',
      caption: 'Golden hour',
      credit: 'Photo: Jane Doe',
      size: 'full',
    }
    expect(value).toEqual(expected)
  })

  it('omits metadata fields that were not provided', async () => {
    const f = makeWriteClient({ assetId: 'image-bare-1x1-jpg' })
    const adapter = createReferenceWriteAdapter(f.client)

    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const value = await adapter.uploadImage(blob)

    expect(value).toEqual({
      _type: 'image',
      asset: { _type: 'reference', _ref: 'image-bare-1x1-jpg' },
    })
    expect('alt' in value).toBe(false)
    expect('caption' in value).toBe(false)
  })

  it('passes filename through when given a File', async () => {
    const f = makeWriteClient()
    const adapter = createReferenceWriteAdapter(f.client)

    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    await adapter.uploadImage(file)

    const uploadOpts = f.upload.mock.calls[0][2]
    expect(uploadOpts).toMatchObject({ filename: 'photo.jpg', contentType: 'image/jpeg' })
  })
})

describe('SanityWriteAdapter — token-agnostic contract', () => {
  it('a host can supply any adapter implementation without a token (AC1/AC2)', async () => {
    // Proves the component depends only on the interface: a hand-rolled adapter
    // that hits a hypothetical signing endpoint satisfies the contract, no
    // Sanity client or token involved.
    const fakeEndpoint = vi.fn().mockResolvedValue({ _id: 'from-endpoint' })
    const hostAdapter: SanityWriteAdapter = {
      save: (post) => fakeEndpoint(post),
      uploadImage: async () => ({
        _type: 'image',
        asset: { _type: 'reference', _ref: 'image-host-1' },
      }),
    }

    const saved = await hostAdapter.save({ title: 'Y' })
    expect(saved).toEqual({ _id: 'from-endpoint' })
    const img = await hostAdapter.uploadImage(new Blob(['z']))
    expect(img.asset._ref).toBe('image-host-1')
  })
})

describe('public API exports (to be added to the barrel)', () => {
  it('exposes the write contract + reference factory from the write barrel', async () => {
    const mod = await import('../src/sanity/write')
    expect(typeof mod.createReferenceWriteAdapter).toBe('function')
    expect(mod.DEFAULT_POST_TYPE).toBe('post')
  })
})
