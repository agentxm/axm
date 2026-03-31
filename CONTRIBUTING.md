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

Releases are published from GitHub Actions. `pnpm release:prepare` is the only supported way to cut a release commit locally; the GitHub Release workflow publishes npm packages, uploads release binaries, and updates Homebrew.

### Versioning

We follow [semver](https://semver.org/):

- **patch** (0.1.0 → 0.1.1) — bug fixes, documentation
- **minor** (0.1.1 → 0.2.0) — new features, backward-compatible changes
- **major** (0.2.0 → 1.0.0) — breaking changes to CLI flags, config format, or public API

Version source of truth:

- pending version plans in `.nx/version-plans/*.md`
- `packages/utils/package.json`
- `packages/core/package.json`
- `packages/cli/package.json`

Those three package versions must always match for a release. The release tag does not define the version; it must match the package manifests.

### Release Flow

Create or update a version plan in the PR for any releasable change:

```bash
pnpm release:plan
```

CI enforces version plans for touched release projects with `pnpm release:plan:check`.

The [release workflow](/.github/workflows/publish.yml) runs automatically when a GitHub Release is published. It validates the `cli-v{VERSION}` tag, downloads the compiled binaries from the successful CI run for the same commit, uploads those binaries as Release assets, publishes the npm packages through `nx release publish` with [provenance](https://docs.npmjs.com/generating-provenance-statements) via GitHub OIDC, and updates `agentxm/homebrew-tap` when `HOMEBREW_TAP_TOKEN` is configured.

Prepare the release commit:

```bash
pnpm release:prepare
pnpm release:prepare --dry-run
```

Publish the GitHub Release after CI succeeds for that commit:

```bash
pnpm release:publish cli-v0.1.0
pnpm release:publish cli-v0.1.0 --dry-run
```

`pnpm release` remains an alias for `pnpm release:prepare`.

The safe release flow is:

1. **Plan** — create or update a version plan in the PR with `pnpm release:plan`.
2. **Preflight** — `pnpm release:prepare` checks you're on `main`, working tree is clean, up to date with remote, and release package versions match.
3. **Verify** — Nx runs `pnpm verify` via the release `preVersionCommand`.
4. **Version** — Nx consumes pending version plans, updates `utils`/`core`/`cli`, refreshes `CHANGELOG.md`, and deletes the consumed plan files.
5. **Push** — `pnpm release:prepare` commits the release artifacts and pushes them to `origin/main` with subject `release: cli-v{VERSION}`.
6. **Wait for CI** — wait for the CI workflow on that exact release commit to complete successfully.
7. **Publish** — run `pnpm release:publish cli-v{VERSION}` only after CI is green.
8. The GitHub Release triggers the [release workflow](/.github/workflows/publish.yml), which uploads binaries, publishes npm packages, and updates Homebrew.

### Notes

- Release tags must use the `cli-v{SEMVER}` format, for example `cli-v0.1.0`.
- If the tag version and package manifest versions do not match, the Release workflow fails fast.
- Do not create GitHub Releases manually. Use `pnpm release:publish cli-v{VERSION}` after CI is green.
- Do not publish packages locally as the normal release path; GitHub Actions is the canonical publisher.
- Homebrew automation requires the `HOMEBREW_TAP_TOKEN` repository secret in `agentxm/axm`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
