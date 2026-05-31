<script setup lang="ts">
/**
 * ImageUploader (TASK-006) — lets the user attach their OWN photo to a post.
 *
 * The user picks a local image; the component pre-validates it client-side
 * (type + size), uploads it through the host-supplied `SanityWriteAdapter`
 * (token-agnostic — the binary leaves the browser only via the adapter), and
 * exposes editable `alt`/`caption`/`credit`/`size` fields bound to the result.
 *
 * On success it emits `uploaded` with the body-ready `SanityImageValue` (with
 * the edited metadata applied). The host appends it into a post body via
 * {@link appendImageToBody} and previews it through `<BlogPostPreview>` — this
 * component does NOT re-implement rendering. No AI image generation: images are
 * user-supplied.
 *
 * Upload failures (bad token / 403, oversized, wrong type) surface as a visible
 * error (`data-testid="upload-error"`) rather than failing silently.
 */
import { computed, ref } from 'vue'
import type { SanityWriteAdapter, SanityImageValue, ImageMeta } from '../sanity/write/adapter'
import { useImageUpload, type UseImageUploadOptions } from './useImageUpload'

type ImageSize = NonNullable<SanityImageValue['size']>

const props = defineProps<{
  /** Host-supplied write adapter. Never a token. */
  adapter: SanityWriteAdapter
  /** Client-side validation overrides (max size / accepted types). */
  validation?: UseImageUploadOptions
}>()

const emit = defineEmits<{
  /** Fired with the body-ready image value after a successful upload. */
  (e: 'uploaded', value: SanityImageValue): void
  /** Fired with the error message when an upload fails or is rejected. */
  (e: 'error', message: string): void
}>()

const { upload, image, error, uploading } = useImageUpload(
  props.adapter,
  props.validation,
)

// Editable authoring fields, bound to the result. Re-emitting on change keeps
// the host's body in sync without a second upload.
const alt = ref('')
const caption = ref('')
const credit = ref('')
const size = ref<ImageSize>('full')

const errorMessage = computed(() => error.value?.message ?? '')

/** Current editable metadata. */
function currentMeta(): ImageMeta {
  const meta: ImageMeta = { size: size.value }
  if (alt.value) meta.alt = alt.value
  if (caption.value) meta.caption = caption.value
  if (credit.value) meta.credit = credit.value
  return meta
}

/** Merge the editable fields onto the uploaded value. */
function withMeta(value: SanityImageValue): SanityImageValue {
  return { ...value, ...currentMeta() }
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const value = await upload(file, currentMeta())
    emit('uploaded', withMeta(value))
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  }
}

/** Re-emit when the user edits the metadata after a successful upload. */
function onMetaChange() {
  if (image.value) emit('uploaded', withMeta(image.value))
}
</script>

<template>
  <div
    class="image-uploader"
    data-testid="image-uploader"
  >
    <label class="image-uploader__file">
      <span>Choose a photo</span>
      <input
        type="file"
        accept="image/*"
        :disabled="uploading"
        data-testid="image-file-input"
        @change="onFileChange"
      >
    </label>

    <p
      v-if="uploading"
      class="image-uploader__status"
      data-testid="upload-status"
    >
      Uploading…
    </p>

    <p
      v-if="errorMessage"
      class="image-uploader__error"
      role="alert"
      data-testid="upload-error"
    >
      {{ errorMessage }}
    </p>

    <fieldset
      v-if="image"
      class="image-uploader__meta"
      data-testid="image-meta"
    >
      <legend>Image details</legend>
      <label>
        Alt text
        <input
          v-model="alt"
          type="text"
          data-testid="image-alt"
          @input="onMetaChange"
        >
      </label>
      <label>
        Caption
        <input
          v-model="caption"
          type="text"
          data-testid="image-caption"
          @input="onMetaChange"
        >
      </label>
      <label>
        Credit
        <input
          v-model="credit"
          type="text"
          data-testid="image-credit"
          @input="onMetaChange"
        >
      </label>
      <label>
        Size
        <select
          v-model="size"
          data-testid="image-size"
          @change="onMetaChange"
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="full">Full</option>
        </select>
      </label>
    </fieldset>
  </div>
</template>

<style scoped>
.image-uploader__error {
  color: #b00020;
  font-weight: 600;
}

.image-uploader__meta {
  display: grid;
  gap: 0.5em;
  margin-top: 1em;
}
</style>
