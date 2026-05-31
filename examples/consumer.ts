// Throwaway consumer that proves the placeholder can be imported from the
// package entry and mounted. Not part of the published package (`files` only
// ships `dist`). Run after `npm run build` from a host app, or adapt into a
// Vite playground. Here it mounts headlessly to assert the public import path.
import { createApp } from 'vue'
import { BlogPlaceholder } from '../src'

const host = document.createElement('div')
const app = createApp(BlogPlaceholder, { title: 'Consumer demo' })
app.mount(host)

// eslint-disable-next-line no-console
console.log(host.innerHTML)
