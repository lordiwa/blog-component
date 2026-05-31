<script setup lang="ts">
/**
 * BlogPostPreview (TASK-003) — read/preview renderer for a Sanity post body.
 *
 * Renders a PortableText `body` via `@portabletext/vue`, using the `components`
 * map ported from blog-implementation-guide.md section 5 (custom styles `lead`/
 * `pullquote`, marks `underline`/`highlight`/`link`/`internalLink`, and the
 * inline `image` type built through `@sanity/image-url`).
 *
 * The component is configuration-driven: consumers supply either their Sanity
 * `projectId`/`dataset` (we build the image-url builder internally) OR a
 * pre-built `imageUrlBuilder`. Vue Router is optional — pass `linkComponent`
 * (e.g. `RouterLink`) to route internal links through the router.
 *
 * List markers survive a global CSS reset thanks to the explicit `list-style`
 * rules in the scoped `<style>` below (guide section 6 / problem #5).
 */
import { computed, toRaw } from 'vue'
import { PortableText } from '@portabletext/vue'
import { createImageUrlBuilder } from '@sanity/image-url'
import type { Component } from 'vue'
import type { BlockContent } from '../sanity/types'
import {
  createPortableComponents,
  type ImageUrlBuilder,
} from './portableComponents'

const props = defineProps<{
  /** The PortableText body to render (DETAIL query output, internalLink slugs resolved). */
  body: BlockContent
  /** Sanity project id — required unless `imageUrlBuilder` is supplied. */
  projectId?: string
  /** Sanity dataset — defaults to `production` when `projectId` is used. */
  dataset?: string
  /** Pre-built `@sanity/image-url` builder; overrides `projectId`/`dataset`. */
  imageUrlBuilder?: ImageUrlBuilder
  /** Map an internalLink slug to an href. Defaults to `/blog/:slug`. */
  resolveInternalHref?: (slug: string) => string
  /** Component to render internal links with (e.g. Vue Router's RouterLink). */
  linkComponent?: Component
}>()

// Internal builder must NOT share the `imageUrlBuilder` prop name (vue/no-dupe-keys).
const resolvedImageBuilder = computed<ImageUrlBuilder>(() => {
  if (props.imageUrlBuilder) return props.imageUrlBuilder
  if (!props.projectId) {
    throw new Error(
      'BlogPostPreview: provide either `imageUrlBuilder` or `projectId` (+ optional `dataset`).',
    )
  }
  return createImageUrlBuilder({
    projectId: props.projectId,
    dataset: props.dataset ?? 'production',
  })
})

// Hand the link component to the factory UNWRAPPED. `props.linkComponent` may be
// a reactive proxy (e.g. if a consumer stored it in a `ref`); `toRaw` recovers
// the underlying object so it is never reactive at the `h()` call site. The
// factory additionally `markRaw`s it as belt-and-suspenders. Both together
// guarantee "Vue received a Component that was made a reactive object" never
// fires.
const components = computed(() =>
  createPortableComponents({
    imageUrlBuilder: resolvedImageBuilder.value,
    resolveInternalHref: props.resolveInternalHref,
    linkComponent: props.linkComponent ? toRaw(props.linkComponent) : undefined,
  }),
)
</script>

<template>
  <div
    class="post-content"
    data-testid="blog-post-preview"
  >
    <PortableText
      :value="body"
      :components="components"
    />
  </div>
</template>

<style scoped>
/*
 * List-style fix (guide section 6 / problem #5): a global CSS reset in the host
 * app nulls `list-style`, so numbered/bulleted lists lose their markers with no
 * warning. Re-assert markers explicitly inside the post scope.
 */
.post-content :deep(ul) {
  list-style: disc outside;
  padding-left: 1.5em;
}

.post-content :deep(ol) {
  list-style: decimal outside;
  padding-left: 1.5em;
}

.post-content :deep(li) {
  display: list-item;
}

/* Minimal styling for the custom styles/marks so the preview is legible. */
.post-content :deep(.post-lead) {
  font-size: 1.25em;
  line-height: 1.5;
  color: #333;
}

.post-content :deep(.post-pullquote) {
  margin: 1.5em 0;
  padding-left: 1em;
  border-left: 4px solid currentColor;
  font-style: italic;
  text-align: center;
}

.post-content :deep(.post-image) {
  margin: 1.5em 0;
}

.post-content :deep(.post-image--small) {
  max-width: 40%;
}

.post-content :deep(.post-image--medium) {
  max-width: 70%;
}

.post-content :deep(.post-image__img) {
  max-width: 100%;
  height: auto;
}

.post-content :deep(.post-image__figcaption) {
  font-size: 0.875em;
  color: #666;
}

.post-content :deep(.post-image__credit) {
  display: block;
  font-style: italic;
}
</style>
