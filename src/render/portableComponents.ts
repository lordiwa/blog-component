// PortableText `components` map for the blog body renderer (TASK-003).
//
// Ported from blog-implementation-guide.md section 5. Each custom block style,
// mark and body type the `blockContent` schema can emit MUST have a renderer
// here, otherwise @portabletext/vue renders nothing and only logs a console
// warning (guide problem #4 — silent fail). We additionally install explicit
// `unknownType` / `unknownMark` / `unknownBlockStyle` handlers so a missing
// renderer is *visible* (a styled placeholder) rather than silent.
//
// Renderers are written as `h()` functions, matching the guide. @portabletext/vue
// passes `value` (the block/mark data) as a prop and exposes the rendered
// children through the component's default slot.

import { h, markRaw, type Component, type VNode } from 'vue'
import type { ImageUrlBuilder as SanityImageUrlBuilder } from '@sanity/image-url'
import type { PortableTextComponents } from '@portabletext/vue'
import type { SanityImage } from '../sanity/types'

/**
 * The builder returned by `@sanity/image-url`'s `createImageUrlBuilder(client)`.
 * Re-exported under our own name so the deprecated default export never leaks
 * into the public type surface (`dist/index.d.ts`).
 */
export type ImageUrlBuilder = SanityImageUrlBuilder

/**
 * The exhaustive list of custom body TYPES the `blockContent` schema can emit
 * that need a `components.types` renderer. Used by the test/checklist so adding
 * a new schema type without a renderer fails loudly (acceptance criterion #4).
 *
 * NOTE: keep this in sync with the Studio `blockContent` schema. Standard text
 * `block`s are handled by the library default and are intentionally excluded.
 */
export const CUSTOM_BODY_TYPES = ['image'] as const

/**
 * Custom block STYLES the schema adds on top of the defaults (normal/h1..h6/
 * blockquote). Each needs a `components.block` renderer.
 */
export const CUSTOM_BLOCK_STYLES = ['lead', 'pullquote'] as const

/**
 * Custom MARKS the schema adds that require an EXPLICIT renderer in
 * `components.marks` (because @portabletext/vue has no built-in for them):
 * the `underline`/`highlight` decorators and the `link`/`internalLink`
 * annotations. The coverage test asserts every entry here is rendered.
 *
 * NOTE: the schema also defines `strike` and `code` decorators (guide §2).
 * They are intentionally DELEGATED to @portabletext/vue's default mark map
 * (which renders `<del>` / `<code>`), so they are listed separately in
 * `DELEGATED_DECORATOR_MARKS` rather than here — see that constant for why the
 * checklist stays honest.
 */
export const CUSTOM_MARKS = ['underline', 'highlight', 'link', 'internalLink'] as const

/**
 * Schema decorators that exist in `blockContent` but are deliberately left to
 * @portabletext/vue's built-in renderers instead of being overridden here:
 * - `strike` → library renders `<del>`
 * - `code`   → library renders `<code>`
 *
 * They are enumerated (not silently omitted) so acceptance criterion #4's
 * checklist is a truthful, exhaustive accounting of every schema decorator:
 * each one is either custom-rendered (`CUSTOM_MARKS`) or knowingly delegated
 * here. Adding a new decorator to the schema means adding it to one list or the
 * other — otherwise the coverage test flags the gap.
 */
export const DELEGATED_DECORATOR_MARKS = ['strike', 'code'] as const

export type CustomBodyType = (typeof CUSTOM_BODY_TYPES)[number]
export type CustomBlockStyle = (typeof CUSTOM_BLOCK_STYLES)[number]
export type CustomMark = (typeof CUSTOM_MARKS)[number]
export type DelegatedDecoratorMark = (typeof DELEGATED_DECORATOR_MARKS)[number]

/**
 * How an `internalLink` mark is turned into a routed element. Defaults to a
 * plain `<a href="/blog/:slug">`, which works without Vue Router. Consumers
 * using Vue Router can pass `linkComponent: RouterLink` (and the resolver will
 * use `to` instead of `href`).
 */
export interface PortableComponentsOptions {
  /** Required to turn inline `image` blocks into CDN URLs. */
  imageUrlBuilder: ImageUrlBuilder
  /**
   * Build the destination for an `internalLink` slug. Defaults to
   * `(slug) => '/blog/' + slug`.
   */
  resolveInternalHref?: (slug: string) => string
  /**
   * Component to render internal links with (e.g. Vue Router's `RouterLink`).
   * When provided it receives a `to` prop; otherwise a plain `<a href>` is used.
   */
  linkComponent?: Component
}

const defaultResolveInternalHref = (slug: string): string => `/blog/${slug}`

/** Pixel width passed to the image builder per the schema `size` field. */
const SIZE_TO_WIDTH: Record<NonNullable<SanityImage['size']>, number> = {
  small: 480,
  medium: 960,
  full: 1600,
}

/**
 * Build the `components` object for `<PortableText :components="...">`.
 */
export function createPortableComponents(
  options: PortableComponentsOptions,
): PortableTextComponents {
  const { imageUrlBuilder: builder } = options
  const resolveInternalHref = options.resolveInternalHref ?? defaultResolveInternalHref
  // Mark the injected component non-reactive at the exact point it is handed to
  // `h()` below. If a consumer passes a reactive proxy (e.g. from a `ref`/store),
  // `h(reactiveComponent, ...)` triggers "Vue received a Component that was made
  // a reactive object". `markRaw` here guarantees the value `h()` sees carries
  // `__v_skip`, so `isReactive()` is false regardless of how it was passed in.
  const linkComponent = options.linkComponent ? markRaw(options.linkComponent) : undefined

  // A loud, visible placeholder so missing renderers are never silent.
  const missing = (label: string, detail?: string): VNode =>
    h(
      'span',
      {
        class: 'post-missing-renderer',
        'data-testid': 'missing-renderer',
        style: 'outline:2px dashed #c00;color:#c00;padding:0 .25em;',
      },
      detail ? `[missing renderer: ${label} "${detail}"]` : `[missing renderer: ${label}]`,
    )

  return {
    // ---- Block styles -----------------------------------------------------
    block: {
      lead: (_props, { slots }) => h('p', { class: 'post-lead' }, slots.default?.()),
      pullquote: (_props, { slots }) =>
        h('blockquote', { class: 'post-pullquote' }, slots.default?.()),
    },

    // ---- Marks (annotations + decorators) ---------------------------------
    marks: {
      underline: (_props, { slots }) => h('u', slots.default?.()),
      highlight: (_props, { slots }) => h('mark', slots.default?.()),
      link: (props: { value?: { href?: string; blank?: boolean } }, { slots }) => {
        const blank = props.value?.blank === true
        return h(
          'a',
          {
            class: 'post-link',
            href: props.value?.href,
            target: blank ? '_blank' : undefined,
            rel: blank ? 'noopener noreferrer' : undefined,
          },
          slots.default?.(),
        )
      },
      // `internalLink` markDefs are resolved to a `slug` string by the DETAIL
      // GROQ query (guide section 5 — internalLink gotcha).
      internalLink: (props: { value?: { slug?: string } }, { slots }) => {
        const slug = props.value?.slug
        if (!slug) return missing('internalLink (unresolved slug)')
        const dest = resolveInternalHref(slug)
        if (linkComponent) {
          return h(linkComponent, { to: dest, class: 'post-internal-link' }, () => slots.default?.())
        }
        return h('a', { href: dest, class: 'post-internal-link' }, slots.default?.())
      },
    },

    // ---- Custom body types ------------------------------------------------
    types: {
      image: (props: { value?: SanityImage }) => {
        const value = props.value
        if (!value?.asset?._ref) return missing('image (no asset)')

        const width = SIZE_TO_WIDTH[value.size ?? 'full']
        const src = builder.image(value).width(width).fit('max').auto('format').url()

        const figureChildren: VNode[] = [
          h('img', {
            class: 'post-image__img',
            src,
            alt: value.alt ?? '',
            loading: 'lazy',
          }),
        ]

        const captionParts: VNode[] = []
        if (value.caption) {
          captionParts.push(h('span', { class: 'post-image__caption' }, value.caption))
        }
        if (value.credit) {
          captionParts.push(h('span', { class: 'post-image__credit' }, value.credit))
        }
        if (captionParts.length) {
          figureChildren.push(h('figcaption', { class: 'post-image__figcaption' }, captionParts))
        }

        return h(
          'figure',
          {
            class: ['post-image', `post-image--${value.size ?? 'full'}`],
            'data-testid': 'post-image',
          },
          figureChildren,
        )
      },
    },

    // ---- Loud fallbacks: never fail silently ------------------------------
    unknownType: (props: { value?: { _type?: string } }) =>
      missing('block type', props.value?._type),
    unknownMark: (props: { markType?: string }, { slots }) =>
      h('span', { class: 'post-missing-renderer', 'data-testid': 'missing-renderer' }, [
        missing('mark', props.markType),
        slots.default?.(),
      ]),
    unknownBlockStyle: (props: { value?: { style?: string } }, { slots }) =>
      h('p', { class: 'post-missing-renderer', 'data-testid': 'missing-renderer' }, [
        missing('block style', props.value?.style),
        slots.default?.(),
      ]),
  }
}
