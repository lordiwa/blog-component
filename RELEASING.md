# Releasing blog-component

This is the copy-pasteable guide for publishing `blog-component` as a tagged
GitHub release that other projects install by git ref. Replace `<user>` with
your GitHub handle throughout.

> The package is distributed **via GitHub** (not npm). There is no `npm publish`
> step — consumers install a git ref, and the `prepare` script builds `dist/` on
> their machine at install time. `dist/` is therefore gitignored (never
> committed); see the README "Build output" / "Install" sections.

## Prerequisites

- **git** installed.
- **GitHub CLI** (`gh`) authenticated — run once:

  ```sh
  gh auth login
  ```

  (If you prefer not to use `gh`, the manual `git remote` alternative is shown
  below.)

## 1. First-time repository setup

From the repo root:

```sh
git init
git branch -M main
git add .
git commit -m "feat: initial blog-component library"
```

Then create the GitHub repo and push. With the GitHub CLI:

```sh
gh repo create <user>/blog-component --private --source=. --remote=origin --push
```

Or manually (if you created the empty repo in the GitHub UI first):

```sh
git remote add origin https://github.com/<user>/blog-component.git
git push -u origin main
```

CI runs automatically on every push and pull request via
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) (lint → typecheck →
typecheck:test → unit tests → build, on Node 20). Confirm it's green before
tagging a release.

## 2. Tag a release

Versioning follows [SemVer](https://semver.org). **Every symbol exported from the
package entry is public API** — a breaking change to any export (removal, rename,
signature/props/events change, or narrowing an exported type) is a **major** bump.
Backward-compatible additions are **minor**; contract-preserving fixes are
**patch**. See [`CHANGELOG.md`](./CHANGELOG.md) for the policy and the recorded
public surface.

Replace `X.Y.Z` with the new version (e.g. `0.1.0`):

1. Bump `version` in `package.json` to `X.Y.Z`.
2. Update [`CHANGELOG.md`](./CHANGELOG.md): rename the `[Unreleased]` section to
   `[X.Y.Z] - YYYY-MM-DD` and start a fresh empty `[Unreleased]` above it.
3. Commit, tag, and push:

   ```sh
   git add package.json CHANGELOG.md
   git commit -m "chore(release): vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --tags
   ```

   (`git push --tags` also works if `origin`/`main` are already tracked.)

Optionally publish GitHub release notes from the tag:

```sh
gh release create vX.Y.Z --title "vX.Y.Z" --notes-from-tag
```

## 3. How consumers install the tagged release

In the consuming project:

```sh
npm install github:<user>/blog-component#vX.Y.Z
```

- `vue@^3.4.0` is a **peer dependency** — the consuming app provides it.
- On install, npm runs this package's `prepare` script, which builds `dist/`
  (ESM bundle + rolled-up `.d.ts` + CSS). No prebuilt artifacts are committed.
- See the README [Install](./README.md#install-from-github) section for the CSS
  import and the transitive runtime dependencies.

## 4. Verify the published types (post-publish)

This is the fresh-project resolution check (AC1) plus the tagged-install check
(AC2). In a **throwaway** TypeScript project:

```sh
mkdir /tmp/bc-verify && cd /tmp/bc-verify
npm init -y
npm install typescript vue@^3.4.0
npm install github:<user>/blog-component#vX.Y.Z
```

Create `check.ts`:

```ts
import { BlogAuthor, createBlogClient } from 'blog-component'

// Touch the values so the import is not elided.
void BlogAuthor
void createBlogClient
```

Then type-check:

```sh
npx tsc --noEmit --moduleResolution bundler --module esnext --strict check.ts
```

Expect **0 errors** — types resolve from the freshly built `dist/index.d.ts`.
