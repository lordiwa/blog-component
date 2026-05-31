import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'blog-component-studio',

  projectId: 'gvc4yjqj',
  dataset: 'production',

  plugins: [structureTool(), visionTool()],

  document: {
    comments: {enabled: true},
  },

  schema: {
    types: schemaTypes,
  },
})
