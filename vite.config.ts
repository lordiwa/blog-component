/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

// Vite library-mode build: emits an ESM bundle and `.d.ts` declarations.
// `vue` is a peer dependency and must stay external (not bundled).
// `@sanity/client` is a runtime dependency kept external so consumers install
// it transitively rather than inheriting a bundled copy (TASK-002).
export default defineConfig({
  plugins: [
    vue(),
    dts({
      include: ['src'],
      // Emit a single rolled-up declaration entry matching package.json `types`.
      rollupTypes: true,
      tsconfigPath: './tsconfig.build.json',
    }),
  ],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'BlogComponent',
      formats: ['es'],
      fileName: () => 'blog-component.js',
    },
    rollupOptions: {
      external: [
        'vue',
        '@sanity/client',
        '@portabletext/vue',
        '@sanity/image-url',
        '@anthropic-ai/sdk',
      ],
      output: {
        globals: {
          vue: 'Vue',
        },
        // Keep the emitted CSS filename stable for the `./style.css` export.
        assetFileNames: (assetInfo) =>
          assetInfo.name === 'style.css' ? 'blog-component.css' : (assetInfo.name ?? 'asset'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts', 'src/**/*.spec.ts'],
  },
})
