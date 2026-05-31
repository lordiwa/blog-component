// SEPARATE Vite config for the LOCAL DEV PLAYGROUND (TASK-008).
//
// This config is dev-only and intentionally distinct from vite.config.ts (the
// library build), so it can never affect what is published. Run it with:
//
//   npm run dev      (== vite --config vite.dev.config.ts)
//
// then open http://localhost:5173.
//
// ROOT / ENTRY CHOICE:
//   We keep the Vite `root` at the PROJECT ROOT and point the dev server at
//   `dev/index.html` via `server.open`. Keeping root at the project root means
//   `src/` and `node_modules/` resolve with no extra aliases, and `loadEnv`
//   reads the project-root `.env`. The single page lives in `dev/`.
//
// SECURITY:
//   `loadEnv(mode, process.cwd(), '')` loads ALL env vars (the empty prefix
//   means non-VITE_ vars are included too) so we can read the SECRETS here, in
//   Node, and hand them to the server-plugin factory — where they stay in a
//   closure. We deliberately do NOT use Vite `define` for secrets: only the
//   VITE_-prefixed projectId/dataset are exposed to the browser (Vite does that
//   automatically via import.meta.env).

import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { devServerPlugin } from './dev/server-plugin'

export default defineConfig(({ mode }) => {
  // Empty prefix => load EVERYTHING, including the non-VITE_ secrets.
  const env = loadEnv(mode, process.cwd(), '')

  const projectId = env.VITE_SANITY_PROJECT_ID ?? 'gvc4yjqj'
  const dataset = env.VITE_SANITY_DATASET ?? 'production'

  // DEV-ONLY cheapest-model default for the demo. ANTHROPIC_MODEL overrides it;
  // setting it explicitly EMPTY falls back to the library's DEFAULT_AI_MODEL
  // (sonnet-4-6). We do not change the library's shipped default.
  const anthropicModel =
    env.ANTHROPIC_MODEL === undefined ? 'claude-haiku-4-5-20251001' : env.ANTHROPIC_MODEL

  return {
    // Project root stays the package root; the playground HTML is in dev/.
    plugins: [
      vue(),
      devServerPlugin({
        projectId,
        dataset,
        // SECRETS — stay server-side; passed into the plugin closure only.
        sanityWriteToken: env.SANITY_WRITE_TOKEN ?? '',
        anthropicApiKey: env.ANTHROPIC_API_KEY ?? '',
        // DEV-ONLY model override (cheapest model for the demo by default).
        anthropicModel,
      }),
    ],
    resolve: {
      alias: {
        // Convenience: import the component by name like a consumer would.
        'blog-component': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      open: '/dev/index.html',
    },
  }
})
