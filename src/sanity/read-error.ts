// Typed consumer-facing read error for the blog-component (TASK-010).
//
// =====================================================================
//  ERROR CONTRACT — why this exists.
// =====================================================================
// project-context.md treats consumer-facing error SHAPES as part of the public
// contract. The read helpers (`getPostList` / `getPostBySlug`) call
// `@sanity/client`'s `fetch`, which can reject with a variety of raw SDK / network
// errors (CORS failure, 401/403, malformed GROQ, transport errors). Leaking those
// raw shapes would couple consumers to `@sanity/client` internals and make error
// handling brittle.
//
// So the read path NORMALIZES every rejection into a single typed
// `BlogReadError`: a stable `name`, a clear message, the originating error
// preserved as `cause` (NOT swallowed — full detail is still available), the
// `operation` that failed, and the `slug` for the by-slug case. Consumers can
// `catch` and branch on `err instanceof BlogReadError` (or `isBlogReadError`),
// read `err.operation`, and still inspect `err.cause` for the underlying detail.
//
// This is a PUBLIC export (re-exported from src/index.ts) and therefore subject
// to semver: a breaking change to this shape is a major bump.

/** Which read operation produced a {@link BlogReadError}. */
export type BlogReadOperation = 'getPostList' | 'getPostBySlug'

/**
 * Normalized error thrown by the read helpers when the underlying
 * `client.fetch` rejects. The original error is preserved as {@link cause}.
 */
export class BlogReadError extends Error {
  /** Stable discriminator — always `'BlogReadError'`. */
  override readonly name = 'BlogReadError'
  /** The read operation that failed. */
  readonly operation: BlogReadOperation
  /** The slug requested, for `getPostBySlug` failures. */
  readonly slug?: string
  /**
   * The original error from `client.fetch`. Set via the Error `cause` option
   * AND as an own property so it is available even on older targets/runtimes
   * where the `cause` option is not honored.
   */
  override readonly cause: unknown

  constructor(
    message: string,
    options: { cause: unknown; operation: BlogReadOperation; slug?: string },
  ) {
    super(message, { cause: options.cause })
    this.operation = options.operation
    if (options.slug !== undefined) this.slug = options.slug
    // Own-property assignment for environments that ignore the `cause` option.
    this.cause = options.cause
    // Keep the prototype chain correct when targeting ES5-ish output.
    Object.setPrototypeOf(this, BlogReadError.prototype)
  }
}

/** Type guard: `true` when `e` is a {@link BlogReadError}. */
export function isBlogReadError(e: unknown): e is BlogReadError {
  return e instanceof BlogReadError
}
