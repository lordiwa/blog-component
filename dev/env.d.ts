/// <reference types="vite/client" />

// Ambient typing for the dev playground only (NOT part of the library build).
// Declares the PUBLIC env vars the browser is allowed to see. Secrets are NOT
// declared here because they never reach the browser — they live only in the
// Node server-plugin closure.
interface ImportMetaEnv {
  readonly VITE_SANITY_PROJECT_ID: string
  readonly VITE_SANITY_DATASET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// The dev playground imports the library by its package name via a Vite alias
// (vite.dev.config.ts -> ./src/index.ts). Map it for the editor/typechecker too.
declare module 'blog-component' {
  export * from '../src/index'
}
