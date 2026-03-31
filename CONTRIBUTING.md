# Contributing to axm

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/) (used as the dev runtime)
- [pnpm](https://pnpm.io/) (installed via corepack)
- [Nx](https://nx.dev/) (installed as a devDependency — no global install needed)

### Setup

```bash
corepack enable          # activates pnpm via Node's corepack
pnpm install             # install all workspace dependencies
pnpm build               # build all packages
pnpm test                # run tests
```

### Useful Commands

All commands delegate to Nx for caching and dependency-aware orchestration.

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `pnpm build`           | Build all packages                       |
| `pnpm test`            | Run all tests                            |
| `pnpm test:e2e`        | Run E2E tests only                       |
| `pnpm typecheck`       | Type-check without emitting              |
| `pnpm format`          | Format code and markdown                 |
| `pnpm format:check`    | Check formatting without writing         |
| `pnpm lint`            | Lint with ESLint                         |
| `pnpm lint:fix`        | Lint and auto-fix                        |
| `pnpm verify`          | Run the full pre-PR / pre-release checks |
| `pnpm verify:affected` | Run affected-only verification           |
| `pnpm build:affected`  | Build only packages changed since `main` |
| `pnpm test:affected`   | Test only packages changed since `main`  |
| `pnpm lint:affected`   | Lint only packages changed since `main`  |

## Making Changes

1. Fork the repo and create a branch from `main`.
2. Make your changes.
3. Add or update tests for any new or changed behavior.
4. Ensure CI passes locally: `pnpm verify`.
5. Open a pull request against `main`.

### Code Style

- **TypeScript** in strict mode with [Effect](https://effect.website/) as the standard library.
- **Prettier** for formatting, **ESLint** for linting — both run in CI.
- Co-locate tests with the code they test (`feature.ts` + `feature.test.ts` in the same directory).
- CLI E2E coverage lives in dedicated `packages/<cli>-e2e/` projects and runs against built artifacts.

## Releasing

Releases are published from GitHub Actions. Local version bumps prepare the manifests; the GitHub Release workflow publishes npm packages, release binaries, and Homebrew updates.

### Versioning

We follow [semver](https://semver.org/):

- **patch** (0.1.0 → 0.1.1) — bug fixes, documentation
- **minor** (0.1.1 → 0.2.0) — new features, backward-compatible changes
- **major** (0.2.0 → 1.0.0) — breaking changes to CLI flags, config format, or public API

Version source of truth:

- `packages/core/package.json`
- `packages/cli/package.json`

Those two package versions must always match for a release. The release tag does not define the version; it must match the package manifests.

### Version Bump Helpers

Use the root helper scripts to bump both package versions together:

- `pnpm version:patch`
- `pnpm version:minor`
- `pnpm version:major`

These scripts:

- verify `core` and `cli` are currently on the same version
- bump both manifests with `npm version --no-git-tag-version`
- do not create a commit
- do not create a git tag
- do not publish anything

### Release Flow

The [release workflow](/.github/workflows/publish.yml) runs automatically when a GitHub Release is published. It validates the `cli-v{VERSION}` tag, downloads the compiled binaries from the successful CI run for the same commit, uploads those binaries as Release assets, publishes `@axm.sh/core` and `@axm.sh/cli` to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements) via GitHub OIDC, and updates `agentxm/homebrew-tap` when `HOMEBREW_TAP_TOKEN` is configured.

Release using the automated script:

```bash
pnpm release minor            # patch | minor | major
pnpm release minor --dry-run  # verify only, no version bump or publish
```

The script (`scripts/release.ts`) runs all steps end-to-end:

1. **Preflight** — checks you're on `main`, working tree is clean, up to date with remote, and `core`/`cli` versions match.
2. **Verify** — runs `nx format:check`, then `nx run-many -t lint typecheck build test --nxBail`, then `nx run-many -t e2e --nxBail --parallel=1` with `NX_TUI=false`.
3. **Bump** — bumps both `core` and `cli` manifests via `npm version --no-git-tag-version`.
4. **Publish** — commits the version bump, pushes to `origin/main`, and creates a GitHub Release (`cli-v{VERSION}`).
5. The GitHub Release triggers the [release workflow](/.github/workflows/publish.yml), which publishes npm packages, release binaries, and Homebrew updates.

### Notes

- Release tags must use the `cli-vX.Y.Z` format, for example `cli-v0.1.0`.
- If the tag version and package manifest versions do not match, the Release workflow fails fast.
- Run `gh release create ...` only after the release commit has been pushed.
- Do not publish packages locally as the normal release path; GitHub Actions is the canonical publisher.
- Homebrew automation requires the `HOMEBREW_TAP_TOKEN` repository secret in `agentxm/axm`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
