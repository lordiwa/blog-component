import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { createImageUrlBuilder } from '@sanity/image-url'
import BlogPostPreview from '../src/render/BlogPostPreview.vue'
import {
  createPortableComponents,
  CUSTOM_BODY_TYPES,
  CUSTOM_BLOCK_STYLES,
  CUSTOM_MARKS,
  DELEGATED_DECORATOR_MARKS,
} from '../src/render'
import type { BlockContent } from '../src/sanity/types'

// A minimal real image-url builder so the inline `image` renderer can produce a
// CDN URL without a network call.
const builder = createImageUrlBuilder({ projectId: 'testproj', dataset: 'production' })

// A body that exercises every acceptance-criterion surface: heading, ordered +
// unordered lists, an (external) link, an internalLink with a resolved slug, and
// an inline image with alt/caption/credit/size.
const sampleBody: BlockContent = [
  {
    _key: 'h',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's0', _type: 'span', text: 'A Heading', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'lead',
    _type: 'block',
    style: 'lead',
    children: [{ _key: 's1', _type: 'span', text: 'Lead intro text', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'ul1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's2', _type: 'span', text: 'bullet one', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'ul2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's3', _type: 'span', text: 'bullet two', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'ol1',
    _type: 'block',
    style: 'normal',
    listItem: 'number',
    level: 1,
    children: [{ _key: 's4', _type: 'span', text: 'step one', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'ol2',
    _type: 'block',
    style: 'normal',
    listItem: 'number',
    level: 1,
    children: [{ _key: 's5', _type: 'span', text: 'step two', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'p-link',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 's6', _type: 'span', text: 'external link', marks: ['ext'] }],
    markDefs: [
      { _key: 'ext', _type: 'link', href: 'https://example.com', blank: true },
    ],
  },
  {
    _key: 'p-internal',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 's7', _type: 'span', text: 'go to other post', marks: ['int'] }],
    markDefs: [{ _key: 'int', _type: 'internalLink', slug: 'other-post' }],
  },
  {
    _key: 'img1',
    _type: 'image',
    asset: { _ref: 'image-abc123-800x600-jpg', _type: 'reference' },
    alt: 'An accessible alt',
    caption: 'A caption',
    credit: 'A credit',
    size: 'medium',
  } as BlockContent[number],
]

const mountPreview = (body: BlockContent, props: Record<string, unknown> = {}) =>
  mount(BlogPostPreview, { props: { body, imageUrlBuilder: builder, ...props } })

describe('BlogPostPreview', () => {
  it('mounts and renders the post-content scope', () => {
    const wrapper = mountPreview(sampleBody)
    expect(wrapper.find('[data-testid="blog-post-preview"]').exists()).toBe(true)
  })

  it('renders a heading', () => {
    const wrapper = mountPreview(sampleBody)
    expect(wrapper.find('h2').text()).toContain('A Heading')
  })

  it('renders the custom `lead` block style', () => {
    const wrapper = mountPreview(sampleBody)
    const lead = wrapper.find('.post-lead')
    expect(lead.exists()).toBe(true)
    expect(lead.text()).toContain('Lead intro text')
  })

  it('renders an unordered list with its items', () => {
    const wrapper = mountPreview(sampleBody)
    const ul = wrapper.find('ul')
    expect(ul.exists()).toBe(true)
    expect(ul.findAll('li').length).toBeGreaterThanOrEqual(2)
    expect(ul.text()).toContain('bullet one')
  })

  it('renders an ordered list with its items', () => {
    const wrapper = mountPreview(sampleBody)
    const ol = wrapper.find('ol')
    expect(ol.exists()).toBe(true)
    expect(ol.findAll('li').length).toBeGreaterThanOrEqual(2)
    expect(ol.text()).toContain('step one')
  })

  it('renders an external link with target/rel when blank', () => {
    const wrapper = mountPreview(sampleBody)
    const a = wrapper.find('a.post-link')
    expect(a.exists()).toBe(true)
    expect(a.attributes('href')).toBe('https://example.com')
    expect(a.attributes('target')).toBe('_blank')
    expect(a.attributes('rel')).toBe('noopener noreferrer')
  })

  it('resolves an internalLink to an in-app route (default /blog/:slug)', () => {
    const wrapper = mountPreview(sampleBody)
    const a = wrapper.find('a.post-internal-link')
    expect(a.exists()).toBe(true)
    expect(a.attributes('href')).toBe('/blog/other-post')
    expect(a.text()).toContain('go to other post')
  })

  it('routes internalLink through a provided linkComponent (RouterLink-style)', () => {
    const RouterLinkStub = {
      name: 'RouterLink',
      props: ['to'],
      setup(p: { to: string }, { slots }: { slots: Record<string, () => unknown> }) {
        return () => h('a', { 'data-router-to': p.to, class: 'router-link' }, slots.default?.())
      },
    }
    const wrapper = mountPreview(sampleBody, { linkComponent: RouterLinkStub })
    const rl = wrapper.find('a.router-link')
    expect(rl.exists()).toBe(true)
    expect(rl.attributes('data-router-to')).toBe('/blog/other-post')
  })

  it('honors a custom resolveInternalHref', () => {
    const wrapper = mountPreview(sampleBody, {
      resolveInternalHref: (slug: string) => `/news/${slug}`,
    })
    expect(wrapper.find('a.post-internal-link').attributes('href')).toBe('/news/other-post')
  })

  it('renders an inline image as a figure with alt/caption/credit and size class', () => {
    const wrapper = mountPreview(sampleBody)
    const figure = wrapper.find('[data-testid="post-image"]')
    expect(figure.exists()).toBe(true)
    expect(figure.classes()).toContain('post-image--medium')
    const img = figure.find('img')
    expect(img.attributes('alt')).toBe('An accessible alt')
    expect(img.attributes('src')).toContain('cdn.sanity.io')
    expect(figure.text()).toContain('A caption')
    expect(figure.text()).toContain('A credit')
  })

  it('accepts projectId/dataset instead of a prebuilt builder', () => {
    const wrapper = mount(BlogPostPreview, {
      props: { body: sampleBody, projectId: 'testproj', dataset: 'production' },
    })
    expect(wrapper.find('[data-testid="post-image"]').exists()).toBe(true)
  })
})

describe('missing-renderer guard (no silent failures)', () => {
  it('renders a visible placeholder for an unknown body type', () => {
    const body: BlockContent = [
      { _key: 'x', _type: 'callout', tone: 'info' } as BlockContent[number],
    ]
    const wrapper = mountPreview(body)
    const placeholder = wrapper.find('[data-testid="missing-renderer"]')
    expect(placeholder.exists()).toBe(true)
    expect(placeholder.text()).toContain('callout')
  })
})

describe('renderer coverage checklist (acceptance criterion #4)', () => {
  const components = createPortableComponents({ imageUrlBuilder: builder })

  it('has a renderer for every custom body type in the schema', () => {
    for (const type of CUSTOM_BODY_TYPES) {
      expect(components.types?.[type], `missing renderer for type "${type}"`).toBeTruthy()
    }
  })

  it('has a renderer for every custom block style', () => {
    for (const style of CUSTOM_BLOCK_STYLES) {
      expect(components.block?.[style], `missing renderer for block style "${style}"`).toBeTruthy()
    }
  })

  it('has a renderer for every custom mark', () => {
    for (const mark of CUSTOM_MARKS) {
      expect(components.marks?.[mark], `missing renderer for mark "${mark}"`).toBeTruthy()
    }
  })

  it('delegates strike/code decorators to the library default (not custom-overridden)', () => {
    // The checklist is honest: every schema decorator is accounted for as either
    // custom-rendered (CUSTOM_MARKS) or knowingly delegated. Delegated decorators
    // must NOT appear in our custom marks map (the library renders <del>/<code>).
    expect(DELEGATED_DECORATOR_MARKS).toContain('strike')
    expect(DELEGATED_DECORATOR_MARKS).toContain('code')
    for (const mark of DELEGATED_DECORATOR_MARKS) {
      expect(components.marks?.[mark], `"${mark}" should be delegated, not custom`).toBeFalsy()
      expect(CUSTOM_MARKS as readonly string[]).not.toContain(mark)
    }
  })

  it('installs loud fallbacks so unknown types/marks/styles are never silent', () => {
    expect(components.unknownType).toBeTruthy()
    expect(components.unknownMark).toBeTruthy()
    expect(components.unknownBlockStyle).toBeTruthy()
  })
})
