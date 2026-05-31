<script setup lang="ts">
/**
 * BlogAuthor (TASK-007) — the headline authoring component.
 *
 * This is the capstone that COMPOSES the already-built pieces into one
 * end-to-end flow:
 *
 *   brief  -> AI draft (TASK-004)        -> generatePostBody / injected hook
 *          -> editable title/excerpt     -> this component
 *          -> upload photos (TASK-006)   -> ImageUploader + appendImageToBody
 *          -> live preview (TASK-003)    -> BlogPostPreview
 *          -> save to Sanity (TASK-005)  -> adapter.save(post)
 *
 * It re-uses those modules; it does NOT re-implement generation, rendering,
 * uploading, or writing.
 *
 * =====================================================================
 *  SECURITY MODEL — secrets stay OUT of this component.
 * =====================================================================
 * Mirrors the rules in blog-implementation-guide.md (#1) and the TASK-004/005
 * security notes. The host injects every credential-bearing capability:
 *
 *   - `adapter: SanityWriteAdapter` — used for BOTH `save` and image upload.
 *     The component never holds a Sanity write token; the adapter routes those
 *     calls to a server-side capability that does.
 *   - AI generation — prefer the injected `generate` function prop. The host
 *     runs it server-side so the Anthropic key NEVER reaches the browser. The
 *     `aiOptions` fallback (calling `generatePostBody` directly) exists only for
 *     code that already runs server-side; do NOT pass a real Anthropic key into
 *     client JS via `aiOptions.apiKey`.
 *
 * =====================================================================
 *  SCOPE BOUNDARY (documented, intentional).
 * =====================================================================
 * A full WYSIWYG block-level PortableText editor is OUT OF SCOPE for this
 * component. "Edit" here means:
 *   - edit the `title` and `excerpt`,
 *   - (re)generate the `body` from a brief,
 *   - append user-uploaded image blocks into the body (and remove them).
 * Rich inline body editing (typing/formatting individual PortableText blocks)
 * is a deliberate FUTURE ENHANCEMENT — the live `<BlogPostPreview>` shows the
 * current body so the author always sees what will be saved.
 *
 * =====================================================================
 *  READ-BACK CONTRACT — what the TASK-002 read queries require (TASK-011).
 * =====================================================================
 * This component composes and saves `{ ...initial, title, excerpt, body,
 * _type }`. The TASK-002 read path filters on two fields a brand-new post does
 * not otherwise carry:
 *   - `POST_BY_SLUG_QUERY` matches on `slug.current`;
 *   - `POST_LIST_QUERY` requires `defined(publishedAt) && publishedAt <= now()`.
 * A post saved on CREATE without those is persisted but INVISIBLE to both read
 * queries. So, by default (`autoPublish` is `true`), on CREATE this component
 * runs the composed post through `withPublishDefaults` BEFORE saving: it
 * auto-derives `slug` from the title (via the same `slugify` as the rest of the
 * write path) and stamps `publishedAt = now`. This makes a freshly-authored post
 * immediately readable.
 * It NEVER overwrites a host-supplied NON-EMPTY value, and NEVER touches an
 * UPDATE: an existing post (one with an `_id`, e.g. seeded via `initialPost`)
 * keeps its own slug/publishedAt untouched. Set `autoPublish={false}` to opt out
 * entirely — then the HOST owns slug/publishedAt (seed them via `initialPost` or
 * inject them in its `SanityWriteAdapter.save`). Only `save` applies these
 * defaults; the `change` event still emits the raw working post.
 *
 * SLUG UNIQUENESS: the derived slug is deterministic and NOT unique — two posts
 * with the same title get the same `slug.current`, and `POST_BY_SLUG_QUERY`'s
 * `[0]` makes the others unreachable. Uniqueness is the HOST's responsibility:
 * supply your own unique `slug`, or use `autoPublish={false}` and mint one (see
 * `withPublishDefaults` for the full policy).
 */
import { computed, reactive, ref } from 'vue'
import { generatePostBody, type GeneratePostOptions, type GeneratedPost } from '../ai/generatePostBody'
import { BlogPostPreview, type ImageUrlBuilder } from '../render'
import { ImageUploader, appendImageToBody } from '../upload'
import type { UseImageUploadOptions } from '../upload'
import { DEFAULT_POST_TYPE, withPublishDefaults } from '../sanity/write'
import type {
  SanityWriteAdapter,
  BlogPostInput,
  SanityImageValue,
} from '../sanity/write/adapter'
import type { Post, BlockContent } from '../sanity/types'

const props = withDefaults(
  defineProps<{
    /**
     * Host-supplied write adapter. Used for BOTH `save(post)` and image upload
     * (passed through to the embedded `<ImageUploader>`). The component NEVER
     * holds a Sanity write token.
     */
    adapter: SanityWriteAdapter
    /**
     * RECOMMENDED, secure default: an injected generation hook the host runs
     * server-side so the Anthropic key never reaches the browser. Takes the
     * brief, resolves a `GeneratedPost`. When supplied, `aiOptions` is ignored.
     */
    generate?: (brief: string) => Promise<GeneratedPost>
    /**
     * Fallback for SERVER-SIDE callers only: options passed straight to
     * `generatePostBody`. Do NOT pass a real Anthropic key (`aiOptions.apiKey`)
     * into client-shippable code — prefer the `generate` hook.
     */
    aiOptions?: GeneratePostOptions
    /** Sanity project id — required unless `imageUrlBuilder` is supplied (for the preview). */
    projectId?: string
    /** Sanity dataset — defaults to `production` when `projectId` is used. */
    dataset?: string
    /** Pre-built `@sanity/image-url` builder; overrides `projectId`/`dataset`. */
    imageUrlBuilder?: ImageUrlBuilder
    /** Client-side upload validation overrides (max size / accepted types). */
    validation?: UseImageUploadOptions
    /**
     * Seed for editing an existing post; its fields round-trip into the saved
     * payload (spread before the live editable fields in {@link composePost}).
     *
     * READ-BACK CONTRACT: the TASK-002 read queries filter on `slug.current`
     * (`POST_BY_SLUG_QUERY`) and `defined(publishedAt) && publishedAt <= now()`
     * (`POST_LIST_QUERY`). By default (`autoPublish`) this component auto-derives
     * both on CREATE; values supplied here are preserved and never overwritten.
     * An existing post being edited (with `_id`) already carries both and is
     * never re-derived.
     */
    initialPost?: Partial<Post>
    /** Document `_type` for the saved post. Defaults to {@link DEFAULT_POST_TYPE}. */
    postType?: string
    /**
     * When `true` (default), on CREATE (no `_id`) the composed post is run
     * through `withPublishDefaults` before saving: `slug` is auto-derived from
     * the title (via `slugify`) and `publishedAt` is stamped to now, so the new
     * post is immediately visible to the TASK-002 read queries. Host-supplied
     * `slug`/`publishedAt` are never overwritten, and an UPDATE (existing `_id`)
     * is never touched. Set `false` to opt out and own slug/publishedAt yourself.
     */
    autoPublish?: boolean
  }>(),
  {
    generate: undefined,
    aiOptions: undefined,
    projectId: undefined,
    dataset: undefined,
    imageUrlBuilder: undefined,
    validation: undefined,
    initialPost: undefined,
    postType: DEFAULT_POST_TYPE,
    autoPublish: true,
  },
)

const emit = defineEmits<{
  /** Fired after a successful save with the persisted document id. */
  (e: 'saved', result: { _id: string }): void
  /** Fired whenever the working post changes (generate / edit / upload). */
  (e: 'change', post: BlogPostInput): void
  /** Fired with a user-visible message when generation, upload, or save fails. */
  (e: 'error', message: string): void
}>()

// --- Working draft state ----------------------------------------------------
// Editable fields live in plain refs; `body` is the PortableText array that the
// preview renders and the save composes. `initialPost` seeds them so an
// existing post can be edited.
const brief = ref('')
const title = ref(props.initialPost?.title ?? '')
const excerpt = ref(props.initialPost?.excerpt ?? '')
const body = ref<BlockContent>(
  props.initialPost?.body ? [...props.initialPost.body] : [],
)

// --- Status state -----------------------------------------------------------
// LOADING is split into the two long-running operations so the UI can show the
// right affordance. ERROR is a single user-visible message. DIRTY tracks unsaved
// changes: set on any edit/generate/upload, cleared only on a successful save.
const generating = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const dirty = ref(false)

const busy = computed(() => generating.value || saving.value)
const canGenerate = computed(() => brief.value.trim().length > 0 && !busy.value)
const canSave = computed(
  () => title.value.trim().length > 0 && !busy.value,
)

/** The current working post, composed for both `change` events and `save`. */
function composePost(): BlogPostInput {
  // Order matters: spread `...initial` FIRST so existing identity/meta
  // (_id, slug, mainImage, featured, ...) round-trips through to Sanity and back
  // via the TASK-002 read path; then the LIVE editable fields (title/excerpt/
  // body) so a user's edits win over any seed values; then `_type` so the saved
  // doc always carries one (the initial post's own `_type`, else `postType`).
  const initial = (props.initialPost ?? {}) as Record<string, unknown>
  return {
    ...initial,
    title: title.value,
    excerpt: excerpt.value,
    body: body.value,
    _type: (initial._type as string | undefined) ?? props.postType,
  }
}

function emitChange() {
  emit('change', composePost())
}

/** Mark the draft dirty and notify the host of the change. */
function markChanged() {
  dirty.value = true
  emitChange()
}

// --- Generate (AI draft) ----------------------------------------------------
async function onGenerate() {
  if (!canGenerate.value) return
  errorMessage.value = ''
  generating.value = true
  try {
    const result = props.generate
      ? await props.generate(brief.value)
      : await runDirectGeneration(brief.value)
    title.value = result.title
    excerpt.value = result.excerpt
    body.value = result.body
    markChanged()
  } catch (err) {
    surfaceError('Generation failed', err)
  } finally {
    generating.value = false
  }
}

/** Fallback path: call `generatePostBody` directly (SERVER-SIDE callers only). */
function runDirectGeneration(b: string): Promise<GeneratedPost> {
  if (!props.aiOptions) {
    return Promise.reject(
      new Error(
        'BlogAuthor: no AI hook configured. Provide the `generate` function prop (recommended, runs server-side) or `aiOptions` for a server-side direct call.',
      ),
    )
  }
  return generatePostBody(b, props.aiOptions)
}

// --- Edit -------------------------------------------------------------------
function onTitleInput() {
  markChanged()
}
function onExcerptInput() {
  markChanged()
}

// --- Upload (append / update image block) -----------------------------------
// The embedded `<ImageUploader>` emits `uploaded` BOTH on the initial upload
// and again on every subsequent meta edit (alt/caption/credit/size). So this
// single handler must:
//   - APPEND a new image block the first time an asset is seen, and
//   - UPDATE that same block in place on later meta edits.
// We key off the asset `_ref`. The most-recently-uploaded asset is the one the
// editable meta fields are bound to, so we match the LAST block with that ref.
function onImageUploaded(value: SanityImageValue) {
  const lastIndex = lastImageIndexFor(value.asset._ref)
  if (lastIndex === -1) {
    // First time: reuse the TASK-006 helper so the appended block carries a
    // unique `_key` and the exact shape the TASK-003 preview renders.
    body.value = appendImageToBody(body.value, value)
  } else {
    body.value = replaceImageMeta(body.value, lastIndex, value)
  }
  markChanged()
}

function lastImageIndexFor(assetRef: string): number {
  for (let i = body.value.length - 1; i >= 0; i -= 1) {
    const block = body.value[i]
    if (block._type === 'image' && (block.asset as { _ref?: string })?._ref === assetRef) {
      return i
    }
  }
  return -1
}

/**
 * Deferred TASK-006 finding: when an image meta field (alt/caption/credit/size)
 * is CLEARED, propagate the cleared/empty value rather than silently keeping the
 * old one. We rebuild the block from the incoming value (keeping only the stable
 * `_key`), so any cleared field is DELETED from the stored block.
 *
 * Hardened against cross-component coupling: we do NOT rely on `ImageUploader`
 * OMITTING empty fields. We NORMALIZE here — an empty-string OR undefined
 * alt/caption/credit is treated as ABSENT, so a cleared text field is removed
 * regardless of whether the uploader emits `''` or omits the key. `size` is a
 * `select` that is never empty in practice, but is treated the same way: a
 * blank/undefined `size` is dropped rather than persisted.
 */
function replaceImageMeta(
  current: BlockContent,
  index: number,
  value: SanityImageValue,
): BlockContent {
  const next = [...current]
  const key = next[index]._key
  const rebuilt: BlockContent[number] = { _key: key, _type: 'image', asset: value.asset }
  // `''` and `undefined` both mean "cleared" -> omit the field entirely.
  if (nonEmpty(value.alt)) rebuilt.alt = value.alt
  if (nonEmpty(value.caption)) rebuilt.caption = value.caption
  if (nonEmpty(value.credit)) rebuilt.credit = value.credit
  if (value.size) rebuilt.size = value.size
  next[index] = rebuilt
  return next
}

/** True when a meta string is present and non-empty (cleared fields read empty). */
function nonEmpty(v: string | undefined): v is string {
  return typeof v === 'string' && v !== ''
}

function onUploadError(message: string) {
  surfaceError('Image upload failed', message)
}

// --- Save -------------------------------------------------------------------
async function onSave() {
  if (!canSave.value) return
  errorMessage.value = ''
  saving.value = true
  try {
    // TASK-011: apply publish defaults (derive slug + publishedAt on CREATE)
    // unless the host opted out. `withPublishDefaults` is a no-op on UPDATE and
    // never overwrites host-supplied values.
    const composed = composePost()
    const toSave = props.autoPublish ? withPublishDefaults(composed) : composed
    const result = await props.adapter.save(toSave)
    dirty.value = false
    emit('saved', result)
  } catch (err) {
    surfaceError('Save failed', err)
  } finally {
    saving.value = false
  }
}

// --- Error helper -----------------------------------------------------------
function surfaceError(context: string, err: unknown) {
  const detail = err instanceof Error ? err.message : String(err)
  const message = `${context}: ${detail}`
  errorMessage.value = message
  emit('error', message)
}

// Expose a small imperative surface for hosts that drive the component in tests
// or wizards. Kept minimal and stable.
defineExpose(
  reactive({
    dirty,
    generating,
    saving,
    composePost,
  }),
)
</script>

<template>
  <section
    class="blog-author"
    data-testid="blog-author"
  >
    <!-- 1) Brief -> generate -->
    <div class="blog-author__brief">
      <label class="blog-author__field">
        <span>Brief</span>
        <textarea
          v-model="brief"
          rows="3"
          placeholder="Describe the post you want to write…"
          data-testid="brief-input"
        />
      </label>
      <button
        type="button"
        :disabled="!canGenerate"
        data-testid="generate-button"
        @click="onGenerate"
      >
        Generate draft
      </button>
    </div>

    <!-- Loading: generating -->
    <p
      v-if="generating"
      class="blog-author__status"
      data-testid="generating-status"
      role="status"
    >
      Generating draft…
    </p>

    <!-- Error (generation / upload / save) -->
    <p
      v-if="errorMessage"
      class="blog-author__error"
      role="alert"
      data-testid="author-error"
    >
      {{ errorMessage }}
    </p>

    <!-- 2) Editable title / excerpt -->
    <div class="blog-author__edit">
      <label class="blog-author__field">
        <span>Title</span>
        <input
          v-model="title"
          type="text"
          data-testid="title-input"
          @input="onTitleInput"
        >
      </label>
      <label class="blog-author__field">
        <span>Excerpt</span>
        <textarea
          v-model="excerpt"
          rows="2"
          data-testid="excerpt-input"
          @input="onExcerptInput"
        />
      </label>
    </div>

    <!-- 3) Upload photos (appends image blocks into the body) -->
    <ImageUploader
      :adapter="adapter"
      :validation="validation"
      data-testid="author-uploader"
      @uploaded="onImageUploaded"
      @error="onUploadError"
    />

    <!-- 4) Live preview of the current body -->
    <div class="blog-author__preview">
      <h3>Live preview</h3>
      <BlogPostPreview
        :body="body"
        :project-id="projectId"
        :dataset="dataset"
        :image-url-builder="imageUrlBuilder"
      />
    </div>

    <!-- 5) Save -->
    <div class="blog-author__actions">
      <span
        v-if="dirty"
        class="blog-author__dirty"
        data-testid="dirty-indicator"
      >Unsaved changes</span>
      <button
        type="button"
        :disabled="!canSave"
        data-testid="save-button"
        @click="onSave"
      >
        {{ saving ? 'Saving…' : 'Save to Sanity' }}
      </button>
      <span
        v-if="saving"
        class="blog-author__status"
        data-testid="saving-status"
        role="status"
      >Saving…</span>
    </div>
  </section>
</template>

<style scoped>
.blog-author {
  display: grid;
  gap: 1.5em;
}

.blog-author__field {
  display: grid;
  gap: 0.25em;
}

.blog-author__field textarea,
.blog-author__field input {
  width: 100%;
}

.blog-author__error {
  color: #b00020;
  font-weight: 600;
}

.blog-author__dirty {
  color: #9a6700;
  font-weight: 600;
}

.blog-author__actions {
  display: flex;
  align-items: center;
  gap: 1em;
}
</style>
