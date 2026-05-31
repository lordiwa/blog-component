<script setup lang="ts">
/**
 * Placeholder component for the blog-component library shell.
 *
 * It exists only to prove the packaging/build/test pipeline end to end
 * (TASK-001). Real authoring UI (Sanity reads/writes, AI drafting,
 * PortableText preview) replaces it in later tickets.
 */
withDefaults(
  defineProps<{
    /** Optional title shown above the placeholder message. */
    title?: string
  }>(),
  {
    title: 'blog-component',
  },
)
</script>

<template>
  <section class="blog-placeholder" data-testid="blog-placeholder">
    <h2 class="blog-placeholder__title">{{ title }}</h2>
    <p class="blog-placeholder__message">Blog component placeholder</p>
  </section>
</template>

<style scoped>
.blog-placeholder {
  font-family: system-ui, sans-serif;
  padding: 1rem;
}

.blog-placeholder__title {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
}

.blog-placeholder__message {
  margin: 0;
  color: #555;
}
</style>
