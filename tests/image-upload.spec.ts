import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import {
  useImageUpload,
  appendImageToBody,
  DEFAULT_MAX_IMAGE_BYTES,
  ImageUploadError,
} from '../src/upload'
import ImageUploader from '../src/upload/ImageUploader.vue'
import type { SanityWriteAdapter, SanityImageValue } from '../src/sanity/write/adapter'
import type { BlockContent } from '../src/sanity/types'

// ---------------------------------------------------------------------------
// Adapter mock. The component is token-agnostic: it only ever sees this
// interface, never a Sanity client or a token. We stub the two methods the
// contract exposes; `save` is here only to satisfy the type — upload never
// calls it.
// ---------------------------------------------------------------------------
function makeAdapter(
  result: SanityImageValue = {
    _type: 'image',
    asset: { _type: 'reference', _ref: 'image-abc123-2000x1500-jpg' },
  },
) {
  const uploadImage = vi.fn<
    Parameters<SanityWriteAdapter['uploadImage']>,
    ReturnType<SanityWriteAdapter['uploadImage']>
  >(async (_file, meta) => ({ ...result, ...(meta ?? {}) }))
  const save = vi.fn<
    Parameters<SanityWriteAdapter['save']>,
    ReturnType<SanityWriteAdapter['save']>
  >(async () => ({ _id: 'post-1' }))
  const adapter: SanityWriteAdapter = { uploadImage, save }
  return { adapter, uploadImage, save }
}

function imageFile(name = 'photo.jpg', type = 'image/jpeg', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

describe('appendImageToBody helper', () => {
  const imageValue: SanityImageValue = {
    _type: 'image',
    asset: { _type: 'reference', _ref: 'image-xyz-800x600-png' },
    alt: 'A cat',
    caption: 'Golden hour',
    credit: 'Photo: Jane Doe',
    size: 'full',
  }

  it('appends an image block carrying the asset + alt/caption/credit/size', () => {
    const body: BlockContent = []
    const next = appendImageToBody(body, imageValue)

    expect(next).toHaveLength(1)
    const block = next[0]
    expect(block._type).toBe('image')
    expect(block.asset).toEqual({ _type: 'reference', _ref: 'image-xyz-800x600-png' })
    expect(block.alt).toBe('A cat')
    expect(block.caption).toBe('Golden hour')
    expect(block.credit).toBe('Photo: Jane Doe')
    expect(block.size).toBe('full')
  })

  it('generates a unique _key on the appended block', () => {
    const a = appendImageToBody([], imageValue)
    const b = appendImageToBody([], imageValue)
    expect(typeof a[0]._key).toBe('string')
    expect(a[0]._key).not.toBe('')
    // Two independent appends of the same value must not collide.
    expect(a[0]._key).not.toBe(b[0]._key)
  })

  it('gives each appended image a distinct _key within the same body', () => {
    let body: BlockContent = []
    body = appendImageToBody(body, imageValue)
    body = appendImageToBody(body, imageValue)
    expect(body).toHaveLength(2)
    expect(body[0]._key).not.toBe(body[1]._key)
  })

  it('returns a NEW array and preserves existing blocks (no mutation)', () => {
    const existing: BlockContent = [
      { _key: 'b1', _type: 'block', children: [], markDefs: [] },
    ]
    const next = appendImageToBody(existing, imageValue)
    expect(next).not.toBe(existing)
    expect(existing).toHaveLength(1)
    expect(next).toHaveLength(2)
    expect(next[0]._key).toBe('b1')
    expect(next[1]._type).toBe('image')
  })
})

describe('useImageUpload — success path', () => {
  it('calls adapter.uploadImage with the file + meta and resolves a SanityImageValue', async () => {
    const { adapter, uploadImage } = makeAdapter()
    const { upload, image, error } = useImageUpload(adapter)

    const file = imageFile()
    const meta = { alt: 'A cat', caption: 'cap', credit: 'me', size: 'medium' as const }
    const value = await upload(file, meta)

    expect(uploadImage).toHaveBeenCalledTimes(1)
    const [passedFile, passedMeta] = uploadImage.mock.calls[0]
    expect(passedFile).toBe(file)
    expect(passedMeta).toMatchObject(meta)

    expect(value).toMatchObject({
      _type: 'image',
      asset: { _type: 'reference', _ref: 'image-abc123-2000x1500-jpg' },
    })
    expect(image.value).toEqual(value)
    expect(error.value).toBeNull()
  })

  it('appends the uploaded value into a body with a unique _key + meta', async () => {
    const { adapter } = makeAdapter()
    const { upload } = useImageUpload(adapter)
    const value = await upload(imageFile(), { alt: 'A cat', size: 'full' })

    const body = appendImageToBody([], value)
    expect(body[0]).toMatchObject({
      _type: 'image',
      asset: { _type: 'reference', _ref: 'image-abc123-2000x1500-jpg' },
      alt: 'A cat',
      size: 'full',
    })
    expect(typeof body[0]._key).toBe('string')
    expect(body[0]._key).not.toBe('')
  })
})

describe('useImageUpload — client-side pre-validation (adapter NOT called)', () => {
  it('rejects a non-image MIME type before calling the adapter', async () => {
    const { adapter, uploadImage } = makeAdapter()
    const { upload, error } = useImageUpload(adapter)

    const pdf = new File([new Uint8Array(10)], 'doc.pdf', { type: 'application/pdf' })
    await expect(upload(pdf)).rejects.toBeInstanceOf(ImageUploadError)

    expect(uploadImage).not.toHaveBeenCalled()
    expect(error.value).toBeTruthy()
    expect(error.value?.code).toBe('invalid-type')
  })

  it('rejects an oversized file before calling the adapter', async () => {
    const { adapter, uploadImage } = makeAdapter()
    const { upload, error } = useImageUpload(adapter, { maxBytes: 1000 })

    const big = imageFile('big.jpg', 'image/jpeg', 2000)
    await expect(upload(big)).rejects.toBeInstanceOf(ImageUploadError)

    expect(uploadImage).not.toHaveBeenCalled()
    expect(error.value).toBeTruthy()
    expect(error.value?.code).toBe('too-large')
  })

  it('uses DEFAULT_MAX_IMAGE_BYTES when no override is given', () => {
    expect(typeof DEFAULT_MAX_IMAGE_BYTES).toBe('number')
    expect(DEFAULT_MAX_IMAGE_BYTES).toBeGreaterThan(0)
  })
})

describe('useImageUpload — adapter failure surfaces a clear error', () => {
  it('maps an adapter rejection (simulated 403) to a user-visible error', async () => {
    const { adapter, uploadImage } = makeAdapter()
    uploadImage.mockRejectedValueOnce(
      new Error('403 Insufficient permissions; permission "create" required'),
    )
    const { upload, error, image } = useImageUpload(adapter)

    await expect(upload(imageFile())).rejects.toThrow(/403|permission|upload/i)

    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(error.value).toBeTruthy()
    expect(error.value?.code).toBe('upload-failed')
    expect(error.value?.message).toContain('403')
    expect(image.value).toBeNull()
  })
})

describe('ImageUploader.vue', () => {
  it('uploads a selected image and emits the body-ready image block with a _key', async () => {
    const { adapter, uploadImage } = makeAdapter()
    const wrapper = mount(ImageUploader, { props: { adapter } })

    const input = wrapper.find('input[type="file"]')
    const file = imageFile()
    Object.defineProperty(input.element, 'files', { value: [file], writable: false })
    await input.trigger('change')
    await flushPromises()

    expect(uploadImage).toHaveBeenCalledTimes(1)
    const events = wrapper.emitted('uploaded')
    expect(events).toBeTruthy()
    const [emitted] = events![0] as [SanityImageValue]
    expect(emitted._type).toBe('image')
    expect(emitted.asset._ref).toBe('image-abc123-2000x1500-jpg')
  })

  it('shows a visible error and does NOT call the adapter for a non-image file', async () => {
    const { adapter, uploadImage } = makeAdapter()
    const wrapper = mount(ImageUploader, { props: { adapter } })

    const input = wrapper.find('input[type="file"]')
    const pdf = new File([new Uint8Array(10)], 'doc.pdf', { type: 'application/pdf' })
    Object.defineProperty(input.element, 'files', { value: [pdf], writable: false })
    await input.trigger('change')
    await flushPromises()

    expect(uploadImage).not.toHaveBeenCalled()
    const err = wrapper.find('[data-testid="upload-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text().length).toBeGreaterThan(0)
  })

  it('surfaces an adapter (403) failure in the UI', async () => {
    const { adapter, uploadImage } = makeAdapter()
    uploadImage.mockRejectedValueOnce(
      new Error('403 Insufficient permissions; permission "create" required'),
    )
    const wrapper = mount(ImageUploader, { props: { adapter } })

    const input = wrapper.find('input[type="file"]')
    const file = imageFile()
    Object.defineProperty(input.element, 'files', { value: [file], writable: false })
    await input.trigger('change')
    await flushPromises()

    const err = wrapper.find('[data-testid="upload-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toMatch(/403|permission|failed/i)
    expect(wrapper.emitted('uploaded')).toBeFalsy()
  })
})

describe('public exports (upload barrel + package entry)', () => {
  it('re-exports the upload API from the upload barrel', async () => {
    const mod = await import('../src/upload')
    expect(typeof mod.useImageUpload).toBe('function')
    expect(typeof mod.appendImageToBody).toBe('function')
    expect(typeof mod.ImageUploadError).toBe('function')
    expect(mod.ImageUploader).toBeTruthy()
  })

  it('re-exports the upload API from the package entry', async () => {
    const mod = await import('../src/index')
    expect(typeof mod.useImageUpload).toBe('function')
    expect(typeof mod.appendImageToBody).toBe('function')
    expect(mod.ImageUploader).toBeTruthy()
  })
})
