# Guía de implementación: Blog con Sanity en Vue 3 + Firebase

> Para portar este blog a otros proyectos. Documenta arquitectura, decisiones, problemas encontrados y soluciones — para que otra AI (o tú dentro de 6 meses) no repita los mismos errores.

## Stack y arquitectura

- **Frontend**: Vue 3 (`<script setup>`) + Vite + Vue Router 4
- **CMS**: Sanity.io (proyecto headless, dataset `production`)
- **Studio CMS**: Sanity Studio v5+ deployado en `<hostname>.sanity.studio` (gratis, hosteado por Sanity)
- **Hosting del sitio**: Firebase Hosting
- **Render de rich text**: `@portabletext/vue` (no usar el viejo `@sanity/block-content-to-vue`)
- **Image CDN**: `@sanity/image-url` con el builder oficial

El Sanity Studio vive en una carpeta hermana al proyecto Vue (`/blog/` en este repo) con su propio `package.json`, `node_modules` y `sanity.config.js`. Es un sub-proyecto independiente.

```
proyecto/
├── src/                   # Vue app
├── public/
├── package.json           # deps de Vue: @sanity/client, @sanity/image-url, @portabletext/vue
├── firebase.json
├── blog/                  # SANITY STUDIO (sub-proyecto)
│   ├── sanity.config.js
│   ├── sanity.cli.js
│   ├── schemaTypes/
│   │   ├── index.js
│   │   ├── post.js
│   │   ├── author.js
│   │   ├── category.js
│   │   ├── blockContent.js
│   │   ├── callout.js
│   │   └── gallery.js
│   └── package.json       # deps del Studio: sanity, @sanity/vision, etc.
└── docs/
    ├── blog-implementation-guide.md   # este archivo
    └── tutorial-blog.html              # tutorial para usuarios finales del CMS
```

---

## Pasos para reimplementar en un proyecto nuevo

### 1. Crear el proyecto Sanity

```bash
npm create sanity@latest -- --template clean --project-id "" --dataset production
```

Te pide loguearte (browser SSO con Google/GitHub) y crea un projectId nuevo. Guarda el `projectId` que genera (ej. `f1p4pgah`) — lo vas a usar en `.env`.

Si lo creas dentro del proyecto Vue existente, ponlo en una carpeta tipo `/blog/` o `/studio/`. NO mezcles sus `node_modules` con los del frontend.

**Versión crítica**: usar Sanity Studio >= **5.1.0**. La 4.x da warnings al deployar y no genera manifest/schema. Si el template inicial te da 4.x, corre `npm install sanity@latest @sanity/vision@latest` dentro del Studio antes de seguir.

### 2. Schema del Studio

Tres documentos base (`post`, `author`, `category`) + un tipo reutilizable `blockContent` (rich text del body) + sub-tipos (`callout`, `gallery`). El esquema completo de este repo está pensado para una empresa de medios/publicidad, con:

- **`post`** con groups (pestañas): Contenido / Metadatos / SEO / Editorial
- **`blockContent`** con marks extra (underline, strike, highlight, code), estilos (Lead, Pullquote), listas numeradas, links internos a otros posts
- **Bloques especiales**: callout (4 tonos), gallery (grid/carousel), divider, CTA button, YouTube/Vimeo/Tweet/iframe embeds
- **Imágenes inline** con campos extra: `alt`, `caption`, `credit`, `size` (small/medium/full)

Copia los archivos de `/blog/schemaTypes/` tal cual y ajusta los textos a tu proyecto.

### 3. Variables de entorno (frontend)

`.env` del proyecto Vue:

```
VITE_SANITY_PROJECT_ID=tu-project-id-aqui
VITE_SANITY_DATASET=production
VITE_SANITY_API_VERSION=2024-01-01
```

### 4. Cliente Sanity (frontend)

Patrón de `src/services/sanity.js`:

```js
import { createClient } from '@sanity/client'

export const client = createClient({
  projectId: import.meta.env.VITE_SANITY_PROJECT_ID,
  dataset: import.meta.env.VITE_SANITY_DATASET || 'production',
  apiVersion: import.meta.env.VITE_SANITY_API_VERSION || '2024-01-01',
  useCdn: true   // CDN para lecturas
})
```

**Queries GROQ separadas** para listado vs detalle (no traer el `body` completo en el listado — sale caro):

```js
*[_type == "post" && defined(publishedAt) && publishedAt <= now()]
  | order(featured desc, publishedAt desc) {
  _id, title, slug, publishedAt, excerpt, mainImage, featured,
  "author": author->{name, image},
  "wordCount": length(pt::text(body))   // calcula tiempo de lectura
}
```

Filtrar `publishedAt <= now()` permite **programar publicaciones** sin lógica adicional — los posts con fecha futura quedan "publicados" en Sanity pero invisibles en el sitio hasta su hora.

### 5. Render del body con `@portabletext/vue`

Instalar: `npm i @portabletext/vue`

El componente `<PortableText :value="..." :components="..." />` necesita un objeto `components` con renderers para CADA tipo de bloque, mark, list, o style custom. Si te falta uno verás un warning tipo:
> `Unknown block type "image"`

Patrón en `BlogPostDetail.vue`:

```js
const portableComponents = {
  block: {
    lead: ({ children }) => h('p', { class: 'post-lead' }, children),
    pullquote: ({ children }) => h('blockquote', { class: 'post-pullquote' }, children),
  },
  marks: {
    underline: ({ children }) => h('u', children),
    highlight: ({ children }) => h('mark', children),
    link: ({ value, children }) => h('a', {
      href: value.href,
      target: value.blank ? '_blank' : null,
      rel: value.blank ? 'noopener noreferrer' : null
    }, children),
    internalLink: ({ value, children }) => h(RouterLink, {
      to: `/blog/${value.slug}`
    }, () => children),
  },
  types: {
    image: ({ value }) => { /* construir <figure> con imageUrlBuilder */ },
    youtubeEmbed: ({ value }) => { /* parsear ID, iframe */ },
    // ... etc
  }
}
```

**Gotcha: link interno** — el `internalLink` mark guarda solo una `reference` al doc. Para resolver el slug en frontend necesitas expandirlo en la query GROQ:

```
body[]{
  ...,
  markDefs[]{
    ...,
    _type == "internalLink" => {
      "slug": @.reference->slug.current
    }
  }
}
```

### 6. Listas — gotcha de CSS

Si tu sitio tiene un reset global de CSS (típico), `<ul>` y `<ol>` pierden los markers. Hay que **setear `list-style` explícitamente** en el scope del post:

```css
.post-content :deep(ul) { list-style: disc outside; }
.post-content :deep(ol) { list-style: decimal outside; }
.post-content :deep(li) { display: list-item; }
```

Sin esto, las listas numeradas se ven sin números. Pasa silenciosamente, no da warning.

### 7. SEO / Open Graph dinámico

Sin frameworks SSR/meta, hay que inyectar tags manualmente en `BlogPostView.vue`:

```js
const setMeta = (name, content) => {
  const attr = name.startsWith('og:') ? 'property' : 'name'
  let el = document.querySelector(`meta[${attr}="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

// onMounted + watch del slug → setMeta para title, description, og:*, twitter:*
// onBeforeUnmount → limpiar los metas que agregó este componente
```

**Limitación**: como es SPA, los crawlers que no ejecutan JS (algunos bots viejos, previews de WhatsApp en ciertos casos) no van a ver los meta correctos. La solución completa requiere SSR/SSG (Nuxt o pre-rendering). Para previews modernas de redes sí funciona.

### 8. Configurar el Studio

`blog/sanity.config.js`:

```js
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {Iframe} from 'sanity-plugin-iframe-pane'
import {schemaTypes} from './schemaTypes'

const SITE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:5173'
  : 'https://tu-proyecto.web.app'

export default defineConfig({
  name: 'default',
  title: 'mi-blog',
  projectId: 'tu-project-id',
  dataset: 'production',
  plugins: [
    structureTool({
      defaultDocumentNode: (S, {schemaType}) => {
        if (schemaType === 'post') {
          return S.document().views([
            S.view.form(),
            S.view.component(Iframe).options({
              url: (doc) => doc?.slug?.current
                ? `${SITE_URL}/blog/${doc.slug.current}`
                : `${SITE_URL}/blog`,
              reload: { button: true },
            }).title('Preview en el sitio'),
          ])
        }
        return S.document().views([S.view.form()])
      },
    }),
    visionTool(),
  ],
  document: { comments: { enabled: true } },  // Comments están built-in
  schema: { types: schemaTypes },
})
```

Live Preview pane se carga desde `sanity-plugin-iframe-pane`. Muestra el sitio renderizado, pero **solo la versión publicada** — para preview de drafts hace falta implementar Visual Editing (`@sanity/visual-editing`), trabajo medio que se puede dejar para después.

### 9. Deploy del Studio

```bash
cd blog
npx sanity deploy
```

Primera vez te pide un hostname (`tuproyecto` → queda en `https://tuproyecto.sanity.studio`). Guarda el `appId` que te devuelve en `sanity.cli.js`:

```js
deployment: {
  appId: 'el-app-id-que-te-da',
  autoUpdates: true,
}
```

Sino te lo pregunta cada vez.

### 10. Deploy del sitio en Firebase

```bash
npm run build
npx firebase deploy --only hosting
```

**Gotcha: el nombre del proyecto Firebase puede no coincidir con el dominio "lindo"**. En este repo el proyecto se llama `treparole-website` y el URL es `treparole-website.web.app`, no `treparole.web.app`. Mira `.firebaserc` para confirmar el `projects.default` real.

### 11. CORS Origins — TODOS los dominios

**Esto se olvida y bloquea producción.** Después de cada deploy a un nuevo dominio, ir a `sanity.io/manage/project/<id>/api` → CORS Origins → Add. Agregar:

- `http://localhost:5173` (dev)
- `https://<proyecto>.web.app` (Firebase principal)
- `https://<proyecto>.firebaseapp.com` (Firebase alterno)
- Dominio custom si hay (`https://midominio.com`)

Sin esto el sitio público falla con error CORS en consola y no carga posts.

NO hace falta agregar `treparole.sanity.studio` — el Studio se comunica con Sanity por otra vía.

---

## Problemas que tuvimos en esta implementación

### 1. Token Editor "Editor" no podía escribir

Intento inicial fue hacer un seed script con write token de Sanity. El token con rol "Editor" devolvió `403 Insufficient permissions; permission "create" required`. Causa real: en plan gratuito de Sanity **el rol "Editor" no existe** para humanos (solo Admin / Viewer / Blueprints manager). Cuando generas un token con dropdown "Editor" pero tu usuario no tiene Editor real, el token hereda permisos de Viewer.

**Solución**: usar el Studio UI para crear contenido (login SSO usa los permisos plenos del Admin). El script de seed quedó abandonado.

**Si quieres scriptear writes**: necesitas plan Growth+ con rol Editor real, o ser Admin y generar un token con permisos elevados (que técnicamente igual ata al usuario).

### 2. CORS bloqueando producción

El cliente de Sanity desde el navegador necesita que cada dominio esté en CORS Origins. Cuando deployamos a Firebase salió error CORS hasta agregar el dominio. Ver paso 11 arriba.

### 3. Sanity Studio v4 → v5 requerido

Studios < 5.1.0 dan warning de "manifest/schema not generated" al deployar. Update siempre a `@latest` al crear el Studio:
```bash
npm install sanity@latest @sanity/vision@latest
```

### 4. PortableText sin renderer para bloques custom

Si agregas un tipo nuevo al schema (image, callout, embed) y no le pones renderer en `components.types`, da warning silencioso y no se renderiza nada visible. **Siempre agregar el renderer cuando agregas un tipo nuevo al body.**

### 5. Listas numeradas sin números (silent fail)

Reset global de CSS nulificó `list-style`. Setearlo explícito en el scope de `.post-content`. Ver paso 6.

### 6. Nombre de proyecto Firebase ≠ dominio "natural"

El proyecto Firebase se llama `treparole-website`, no `treparole`, así que el dominio default es `treparole-website.web.app`. Yo asumí `treparole.web.app` al configurar el preview pane del Studio y el tutorial, y se rompió. Siempre verificar `.firebaserc` antes de configurar URLs en otros lados.

### 7. Live Preview muestra publicado, no draft

`sanity-plugin-iframe-pane` solo renderiza la URL que le pasas. Como el sitio público solo lee posts publicados, el preview muestra la versión publicada, no tu draft en edición. Para preview de drafts hay que implementar Visual Editing — trabajo extra que vale solo si el equipo edita mucho.

### 8. Rol de usuario en Sanity (plan gratuito)

Solo **Administrator** puede escribir. No hay rol intermedio. Para una empresa donde el cliente edita pero NO debe poder borrar el proyecto, necesitas plan Growth ($15/mes/usuario). Mencionar esto al cliente desde el inicio.

---

## Lo que agregamos vs un blog Sanity típico

Un blog generado por `npm create sanity@latest` viene con un schema **minimalista**: post (title, slug, mainImage, body, publishedAt) + author + category. Suficiente para un blog personal.

Para una empresa de medios/publicidad agregamos:

### Schema (Studio)
- Post agrupado por **tabs**: Contenido / Metadatos / SEO / Editorial
- **Subtítulo**, **co-autores** (array de refs), **tags** (string array libre), **featured** toggle, **updatedAt** separado
- **SEO fields**: `seoTitle`, `seoDescription`, `openGraphImage` (distinta a la portada para redes sociales)
- **Editorial fields**: `sources` (array de links con label), `internalNotes` (texto que no se publica)
- Validaciones en campos críticos (longitud de title, formato de URL)

### BlockContent (body)
- Marks extra: **underline**, **strike**, **highlight**, **code inline**
- Estilos extra: **Lead** (intro grande), **Pull quote** (cita destacada centrada)
- **Listas numeradas** (default trae solo bullet)
- **Links internos** a otros posts del blog (mark especial con reference)
- Imágenes con campos **alt**, **caption**, **credit**, **size** (small 40% / medium 70% / full)

### Bloques especiales del body
- **Callout** (4 tonos: info azul, aviso amarillo, destacado blanco, nota del editor)
- **Galería** (grid o carousel horizontal, mínimo 2 imágenes, cada una con caption + credit)
- **Divider** (3 estilos: línea, puntos, asteriscos)
- **CTA button** (primario/secundario con URL configurable)
- **YouTube embed** (URL → iframe, parsea ID de cualquier formato de URL)
- **Vimeo embed**
- **Tweet/X embed** (URL → iframe del embed oficial con tema dark)
- **Iframe genérico** (Spotify/CodePen/Maps/etc, con aspect ratio configurable o altura fija)

### Frontend
- Renderer custom de PortableText para todos los bloques nuevos (~250 líneas de JS en `BlogPostDetail.vue`)
- **Tiempo de lectura** calculado desde el word count (200 wpm)
- **Badge "Destacado"** en cards + ordenamiento `featured desc` en query
- **Meta tags Open Graph + Twitter Card** inyectados por post con cleanup en unmount
- **Programación** vía filtro `publishedAt <= now()` en GROQ (no requiere cron)
- Manejo de **co-autores** ("Por X con Y, Z y W")
- Sección de **Fuentes** al final del artículo si hay refs
- "Actualizado el..." si `updatedAt` difiere de `publishedAt`

### Studio
- **Comments** habilitados (`document.comments.enabled: true`)
- **Live Preview pane** vía `sanity-plugin-iframe-pane` con detección automática de localhost vs prod
- **AppId** guardado en `sanity.cli.js` para deploys idempotentes

### Docs
- `docs/tutorial-blog.html` autocontenido para usuarios finales del CMS (no devs)
- `docs/blog-implementation-guide.md` — este archivo, para devs/AIs futuras

---

## Decisiones que se podrían reconsiderar

- **Tweet embed con iframe oficial de Twitter**: simple pero pesado y depende de que X siga sirviendo `platform.twitter.com/embed/Tweet.html`. Alternativa: usar API de oembed server-side o solo renderizar un blockquote con link.
- **Galería tipo carousel**: implementada con CSS scroll-snap nativo (sin librería). Funciona pero no tiene controles UI ni indicadores de paginación. Si querés más UX, agregar Swiper o Keen-slider.
- **Sin draft preview**: el preview pane muestra solo publicado. Implementar `@sanity/visual-editing` da preview de drafts en tiempo real, pero agrega complejidad: tokens, modo draft en frontend, conditional rendering.
- **Sin tabla de contenidos**: para artículos largos, generar TOC desde los H2/H3 sería un plus. No implementado.
- **Sin paginación en `/blog`**: trae todos los posts. Cuando haya 50+, agregar paginación con offset o cursor en la query GROQ.
- **Sin categorías filtrables en UI**: el schema soporta categorías pero el listado no permite filtrar por una. Cuando haya 10+ categorías agregar UI.

---

## Referencias rápidas

- Documentación oficial Sanity Studio v5: https://www.sanity.io/docs
- `@portabletext/vue` API: https://github.com/portabletext/vue-portabletext
- Sanity image URL builder: https://www.sanity.io/docs/image-url
- GROQ playground: usar el **Vision tool** dentro del Studio (ya viene activo)
- Firebase Hosting docs: https://firebase.google.com/docs/hosting

---

## Costo

Con plan gratuito de Sanity (3 usuarios, 5 GB asset storage, 100k requests/mes en CDN) y Firebase Spark (10 GB hosting, 360 MB/día de bandwidth), un blog corporativo chico-mediano funciona sin pagar. Cuando crezca:

- Sanity Growth: $15/mes/usuario — agrega rol Editor, más storage, más requests
- Firebase Blaze (pay-as-you-go): solo si superas la cuota gratis

Sin trampas ni costos ocultos esperables.
