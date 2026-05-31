// Local barrel for the PortableText preview renderer (TASK-003).
//
// The orchestrator re-exports these from `src/index.ts` to make them part of
// the published API surface. Keeping a module-local barrel lets parallel work
// on `src/index.ts` merge cleanly.
export { default as BlogPostPreview } from './BlogPostPreview.vue'

export {
  createPortableComponents,
  CUSTOM_BODY_TYPES,
  CUSTOM_BLOCK_STYLES,
  CUSTOM_MARKS,
  DELEGATED_DECORATOR_MARKS,
} from './portableComponents'

export type {
  ImageUrlBuilder,
  PortableComponentsOptions,
  CustomBodyType,
  CustomBlockStyle,
  CustomMark,
  DelegatedDecoratorMark,
} from './portableComponents'
