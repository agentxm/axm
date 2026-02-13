# Contributing to axm

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/) (used as the dev runtime)
- [pnpm](https://pnpm.io/) (installed via corepack)

### Setup

```bash
corepack enable          # activates pnpm via Node's corepack
pnpm install             # install all workspace dependencies
pnpm build               # build all packages
pnpm test                # run tests
```

### Useful Commands

| Command          | Purpose                     |
| ---------------- | --------------------------- |
| `pnpm build`     | Build all packages          |
| `pnpm test`      | Run all tests               |
| `pnpm test:e2e`  | Run E2E tests only          |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm format`    | Format code and markdown    |
| `pnpm lint`      | Lint with ESLint            |
| `pnpm lint:fix`  | Lint and auto-fix           |

## Making Changes

1. Fork the repo and create a branch from `main`.
2. Make your changes.
3. Add or update tests for any new or changed behavior.
4. Ensure CI passes: `pnpm build && pnpm test && pnpm lint`.
5. Open a pull request against `main`.

### Code Style

- **TypeScript** in strict mode with [Effect](https://effect.website/) as the standard library.
- **Prettier** for formatting, **ESLint** for linting — both run in CI.
- Co-locate tests with the code they test (`feature.ts` + `feature.test.ts` in the same directory).

## Releasing

Releases are published to npm automatically when a GitHub Release is created. The published package is `@axm.sh/cli`.

### Versioning

We follow [semver](https://semver.org/):

- **patch** (0.1.0 → 0.1.1) — bug fixes, documentation
- **minor** (0.1.1 → 0.2.0) — new features, backward-compatible changes
- **major** (0.2.0 → 1.0.0) — breaking changes to CLI flags, config format, or public API

### Step by Step

**1. Verify `main` is ready to release:**

```bash
git checkout main
git pull origin main
pnpm install
pnpm build && pnpm test && pnpm lint
```

**2. Bump the version in `packages/cli/package.json`:**

```bash
# patch (0.1.0 → 0.1.1), minor (0.1.0 → 0.2.0), or major (0.1.0 → 1.0.0)
pnpm --filter @axm.sh/cli exec npm version minor --no-git-tag-version
```

**3. Commit the version bump and push:**

```bash
git add packages/cli/package.json
git commit -m "release: v0.1.0"
git push origin main
```

**4. Create the GitHub Release:**

Using the GitHub CLI:

```bash
gh release create v0.1.0 --title "v0.1.0" --generate-notes
```

Or via the GitHub UI:

1. Go to the repo → **Releases** → **Draft a new release**.
2. Click **Choose a tag** and type the new tag (e.g., `v0.1.0`). Select **Create new tag on publish**.
3. Set the target branch to `main`.
4. Set the title to the tag name (e.g., `v0.1.0`).
5. Click **Generate release notes** to auto-populate from merged PRs, or write notes manually.
6. Click **Publish release**.

**5. Monitor the publish:**

- The [publish workflow](/.github/workflows/publish.yml) triggers automatically on the release event.
- Check the **Actions** tab in GitHub to confirm the workflow succeeds.
- Verify the package is live: `npm view @axm.sh/cli version`.

### Tag Format

Tags must be prefixed with `v` (e.g., `v0.1.0`, `v1.0.0`). The tag version should match the `version` field in `packages/cli/package.json` exactly.

### How the Publish Workflow Works

1. Triggered by the `release: created` event.
2. Checks out the repo, installs dependencies with `pnpm install --frozen-lockfile`.
3. Builds the CLI package via `tsc`.
4. Publishes to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements) — authenticated via GitHub's OIDC provider (no npm tokens stored as secrets).

### Troubleshooting

- **Workflow failed at publish step** — Check that the [trusted publisher](https://docs.npmjs.com/generating-provenance-statements#publishing-packages-with-provenance-via-github-actions) is configured on npmjs.com for this repo and workflow.
- **Version conflict on npm** — The version in `package.json` already exists on the registry. Bump to a new version and create a new release.
- **Build failed in CI** — The release tag may point to a commit where tests don't pass. Fix on `main`, bump version again, and create a new release.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
