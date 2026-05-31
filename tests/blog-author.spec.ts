import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BlogAuthor from '../src/authoring/BlogAuthor.vue'
import type {
  SanityWriteAdapter,
  SanityImageValue,
  BlogPostInput,
} from '../src/sanity/write/adapter'
import type { GeneratedPost } from '../src/ai/generatePostBody'
import type { BlockContent } from '../src/sanity/types'

// ---------------------------------------------------------------------------
// `@portabletext/vue` is rendered by the embedded <BlogPostPreview>. We stub it
// to a trivial component so the preview mounts in jsdom without exercising the
// (separately tested, TASK-003) renderer internals. The reuse of the hoisted
// mock pattern keeps the BlogAuthor flow assertions focused.
// ---------------------------------------------------------------------------
vi.mock('@portabletext/vue', () => ({
  PortableText: {
    name: 'PortableTextStub',
    props: ['value', 'components'],
    template: '<div data-testid="pt-stub">{{ (value || []).length }}</div>',
  },
}))

// ---------------------------------------------------------------------------
// Adapter mock — the component is token-agnostic and only ever sees this
// interface (never a Sanity client or token). `save` resolves with an id;
// `uploadImage` echoes the requested meta onto a stub asset reference.
// ---------------------------------------------------------------------------
function makeAdapter(
  imageResult: SanityImageValue = {
    _type: 'image',
    asset: { _type: 'reference', _ref: 'image-abc123-2000x1500-jpg' },
  },
) {
  const save = vi.fn<
    Parameters<SanityWriteAdapter['save']>,
    ReturnType<SanityWriteAdapter['save']>
  >(async () => ({ _id: 'post-1' }))
  const uploadImage = vi.fn<
    Parameters<SanityWriteAdapter['uploadImage']>,
    ReturnType<SanityWriteAdapter['uploadImage']>
  >(async (_file, meta) => ({ ...imageResult, ...(meta ?? {}) }))
  const adapter: SanityWriteAdapter = { save, uploadImage }
  return { adapter, save, uploadImage }
}

const generatedPost: GeneratedPost = {
  title: 'Generated Title',
  excerpt: 'Generated excerpt sentence.',
  body: [
    {
      _key: 'b0',
      _type: 'block',
      style: 'normal',
      children: [{ _key: 'b0s0', _type: 'span', text: 'Body paragraph.' }],
      markDefs: [],
    },
  ],
}

function makeGenerate(post: GeneratedPost = generatedPost) {
  return vi.fn(async () => structuredClone(post))
}

function imageFile(name = 'photo.jpg', type = 'image/jpeg', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

function mountAuthor(overrides: Record<string, unknown> = {}) {
  const { adapter, save, uploadImage } = makeAdapter()
  const generate = makeGenerate()
  const wrapper = mount(BlogAuthor, {
    props: {
      adapter,
      generate,
      projectId: 'testproj',
      dataset: 'production',
      ...overrides,
    },
  })
  return { wrapper, adapter, save, uploadImage, generate }
}

async function doGenerate(wrapper: ReturnType<typeof mount>, brief = 'Write about cats') {
  await wrapper.find('[data-testid="brief-input"]').setValue(brief)
  await wrapper.find('[data-testid="generate-button"]').trigger('click')
  await flushPromises()
}

describe('BlogAuthor — generate flow', () => {
  it('calls the injected generate hook with the brief and populates title/excerpt/body', async () => {
    const { wrapper, generate } = mountAuthor()

    await doGenerate(wrapper, 'A post about cats')

    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate.mock.calls[0][0]).toBe('A post about cats')

    expect(
      (wrapper.find('[data-testid="title-input"]').element as HTMLInputElement).value,
    ).toBe('Generated Title')
    expect(
      (wrapper.find('[data-testid="excerpt-input"]').element as HTMLTextAreaElement).value,
    ).toBe('Generated excerpt sentence.')
    // Body flows into the preview stub (length rendered).
    expect(wrapper.find('[data-testid="pt-stub"]').text()).toBe('1')
  })

  it('shows a loading state while generating and clears it afterward', async () => {
    const { adapter } = makeAdapter()
    let resolve!: (p: GeneratedPost) => void
    const generate = vi.fn(
      () => new Promise<GeneratedPost>((r) => (resolve = r)),
    )
    const wrapper = mount(BlogAuthor, {
      props: { adapter, generate, projectId: 'testproj' },
    })

    await wrapper.find('[data-testid="brief-input"]').setValue('brief')
    await wrapper.find('[data-testid="generate-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="generating-status"]').exists()).toBe(true)

    resolve(generatedPost)
    await flushPromises()

    expect(wrapper.find('[data-testid="generating-status"]').exists()).toBe(false)
  })

  it('surfaces a generation failure as a visible error', async () => {
    const { adapter } = makeAdapter()
    const generate = vi.fn(async () => {
      throw new Error('Anthropic 500')
    })
    const wrapper = mount(BlogAuthor, {
      props: { adapter, generate, projectId: 'testproj' },
    })

    await wrapper.find('[data-testid="brief-input"]').setValue('brief')
    await wrapper.find('[data-testid="generate-button"]').trigger('click')
    await flushPromises()

    const err = wrapper.find('[data-testid="author-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toMatch(/500|Anthropic|generat/i)
    expect(wrapper.emitted('error')).toBeTruthy()
  })
})

describe('BlogAuthor — editing + dirty flag', () => {
  it('marks the post dirty when the title is edited', async () => {
    const { wrapper } = mountAuthor()
    await doGenerate(wrapper)

    // Generation itself produces a draft = dirty (unsaved).
    expect(wrapper.find('[data-testid="dirty-indicator"]').exists()).toBe(true)

    await wrapper.find('[data-testid="title-input"]').setValue('Edited Title')
    await flushPromises()

    expect(wrapper.find('[data-testid="dirty-indicator"]').exists()).toBe(true)
    // change event emitted with the edited post.
    const changes = wrapper.emitted('change')
    expect(changes).toBeTruthy()
    const last = changes![changes!.length - 1][0] as Record<string, unknown>
    expect(last.title).toBe('Edited Title')
  })
})

describe('BlogAuthor — image upload appends an image block', () => {
  it('appends an image block (with _key) into the body on upload', async () => {
    const { wrapper, uploadImage } = mountAuthor()
    await doGenerate(wrapper)

    const input = wrapper.find('[data-testid="image-file-input"]')
    const file = imageFile()
    Object.defineProperty(input.element, 'files', { value: [file], writable: false })
    await input.trigger('change')
    await flushPromises()

    expect(uploadImage).toHaveBeenCalledTimes(1)
    // Body now has the original block + the appended image block.
    expect(wrapper.find('[data-testid="pt-stub"]').text()).toBe('2')

    // change event carries the appended image block with a _key.
    const changes = wrapper.emitted('change')!
    const last = changes[changes.length - 1][0] as { body: BlockContent }
    const imageBlock = last.body[last.body.length - 1]
    expect(imageBlock._type).toBe('image')
    expect(typeof imageBlock._key).toBe('string')
    expect(imageBlock._key).not.toBe('')
  })

  it('propagates a CLEARED alt: setting then clearing alt leaves no alt key on the saved block', async () => {
    const { wrapper } = mountAuthor()
    await doGenerate(wrapper)

    // Upload a photo so the editable meta fieldset appears.
    const input = wrapper.find('[data-testid="image-file-input"]')
    Object.defineProperty(input.element, 'files', { value: [imageFile()], writable: false })
    await input.trigger('change')
    await flushPromises()

    // Set alt, then clear it — the uploader re-emits `uploaded` on each edit and
    // BlogAuthor updates the same image block in place.
    const altInput = wrapper.find('[data-testid="image-alt"]')
    await altInput.setValue('A cat')
    await flushPromises()

    let changes = wrapper.emitted('change')!
    let body = (changes[changes.length - 1][0] as { body: BlockContent }).body
    let imageBlock = body[body.length - 1]
    expect(imageBlock.alt).toBe('A cat')
    expect(imageBlock._type).toBe('image')

    // Now CLEAR it. The block must end up WITHOUT an `alt` key (not `''`).
    await altInput.setValue('')
    await flushPromises()

    changes = wrapper.emitted('change')!
    body = (changes[changes.length - 1][0] as { body: BlockContent }).body
    imageBlock = body[body.length - 1]
    expect(imageBlock._type).toBe('image')
    expect('alt' in imageBlock).toBe(false)
    // And only ONE image block exists — meta edits update in place, never append.
    expect(body.filter((b) => b._type === 'image')).toHaveLength(1)
  })
})

describe('BlogAuthor — save flow', () => {
  it('saves the composed post, emits saved with {_id}, and clears dirty', async () => {
    const { wrapper, save } = mountAuthor({ postType: 'post' })
    await doGenerate(wrapper)
    await wrapper.find('[data-testid="title-input"]').setValue('Final Title')

    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalledTimes(1)
    const saved = save.mock.calls[0][0] as BlogPostInput
    expect(saved._type).toBe('post')
    expect(saved.title).toBe('Final Title')
    expect(saved.excerpt).toBe('Generated excerpt sentence.')
    expect(Array.isArray(saved.body)).toBe(true)

    const savedEvents = wrapper.emitted('saved')
    expect(savedEvents).toBeTruthy()
    expect(savedEvents![0][0]).toEqual({ _id: 'post-1' })

    // Dirty cleared on success.
    expect(wrapper.find('[data-testid="dirty-indicator"]').exists()).toBe(false)
  })

  it('composes the saved post from { _type, title, excerpt, body, ...initial }', async () => {
    const initialPost = { _id: 'existing-1', slug: { current: 'my-post' }, featured: true }
    const { wrapper, save } = mountAuthor({ initialPost })
    await doGenerate(wrapper)

    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    const saved = save.mock.calls[0][0] as BlogPostInput
    // initial fields round-trip through to the saved payload.
    expect(saved._id).toBe('existing-1')
    expect(saved.slug).toEqual({ current: 'my-post' })
    expect(saved.featured).toBe(true)
    // composed editable fields present.
    expect(saved.title).toBe('Generated Title')
    expect(saved.body).toBeTruthy()
  })

  it('surfaces a save rejection as a visible error and keeps the post dirty', async () => {
    const { adapter, save } = makeAdapter()
    save.mockRejectedValueOnce(
      new Error('403 Insufficient permissions; permission "create" required'),
    )
    const generate = makeGenerate()
    const wrapper = mount(BlogAuthor, {
      props: { adapter, generate, projectId: 'testproj' },
    })

    await doGenerate(wrapper)
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    const err = wrapper.find('[data-testid="author-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toMatch(/403|permission|save/i)
    expect(wrapper.emitted('error')).toBeTruthy()
    // Still dirty so the user can retry.
    expect(wrapper.find('[data-testid="dirty-indicator"]').exists()).toBe(true)
    // No saved event on failure.
    expect(wrapper.emitted('saved')).toBeFalsy()
  })
})

describe('BlogAuthor — publish defaults (TASK-011)', () => {
  it('on CREATE (no _id) auto-derives slug from title and sets publishedAt before save', async () => {
    const { wrapper, save } = mountAuthor()
    await wrapper.find('[data-testid="title-input"]').setValue('Cómo Programar')

    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalledTimes(1)
    const saved = save.mock.calls[0][0] as BlogPostInput
    expect((saved.slug as { current?: string })?.current).toBe('como-programar')
    expect(typeof saved.publishedAt).toBe('string')
    expect((saved.publishedAt as string).length).toBeGreaterThan(0)
  })

  it('on UPDATE (existing _id) passes host slug/publishedAt through unchanged', async () => {
    const initialPost = {
      _id: 'existing-1',
      slug: { _type: 'slug', current: 'my-existing-post' },
      publishedAt: '2020-01-01T00:00:00.000Z',
    }
    const { wrapper, save } = mountAuthor({ initialPost })
    await wrapper.find('[data-testid="title-input"]').setValue('Edited Title')

    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    const saved = save.mock.calls[0][0] as BlogPostInput
    expect(saved._id).toBe('existing-1')
    expect(saved.slug).toEqual({ _type: 'slug', current: 'my-existing-post' })
    expect(saved.publishedAt).toBe('2020-01-01T00:00:00.000Z')
  })

  it('with autoPublish={false} injects NO slug/publishedAt on create', async () => {
    const { wrapper, save } = mountAuthor({ autoPublish: false })
    await wrapper.find('[data-testid="title-input"]').setValue('Cómo Programar')

    await wrapper.find('[data-testid="save-button"]').trigger('click')
    await flushPromises()

    const saved = save.mock.calls[0][0] as BlogPostInput
    expect('slug' in saved).toBe(false)
    expect('publishedAt' in saved).toBe(false)
  })
})

describe('BlogAuthor — public exports', () => {
  it('is re-exported from the authoring barrel and the package entry', async () => {
    const barrel = await import('../src/authoring')
    expect(barrel.BlogAuthor).toBeTruthy()

    const entry = await import('../src/index')
    expect(entry.BlogAuthor).toBeTruthy()
  })
})
