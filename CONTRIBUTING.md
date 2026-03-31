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

The safe release flow is:

1. **Plan** — create or update a version plan in the PR for any releasable change.

   ```bash
   pnpm release:plan
   ```

   Purpose: record the intended semver bump and changelog entry before cutting the release.

   Outcome: a pending plan file exists in `.nx/version-plans/` for the fixed release group, and CI can enforce that requirement with `pnpm release:plan:check`.

   CI enforces version plans for touched release projects with `pnpm release:plan:check`.

2. **Prepare** — run the release prep from `main`.

   ```bash
   pnpm release:prepare
   pnpm release:prepare --dry-run
   ```

   Purpose: validate repo state, apply the pending version plan, and cut the release commit from `main`.

   Outcome: `pnpm release:prepare --dry-run` previews the release version and artifact changes; `pnpm release:prepare` checks you're on `main`, the working tree is clean, you're up to date with `origin/main`, release package versions match, runs `pnpm verify` via the Nx `preVersionCommand`, consumes pending version plans, updates `utils`/`core`/`cli`, refreshes `CHANGELOG.md`, deletes the consumed plan files, commits the release artifacts, and pushes `release: cli-v{VERSION}` to `origin/main`.

3. **Wait for CI** — wait for the CI workflow on that exact release commit to complete successfully.

   Purpose: verify the exact release commit is green before creating the GitHub Release.

   Outcome: the release commit has a successful CI run and the build artifacts for that commit are available for publishing.

4. **Publish** — publish the GitHub Release only after CI is green.

   ```bash
   pnpm release:publish cli-v0.1.0
   pnpm release:publish cli-v0.1.0 --dry-run
   ```

   Purpose: create the GitHub Release from the validated release commit.

   Outcome: `pnpm release:publish --dry-run` previews the GitHub release creation; `pnpm release:publish cli-v{VERSION}` creates the GitHub Release for the matching `release: cli-v{VERSION}` commit on `origin/main`.

5. **GitHub Actions** — the GitHub Release triggers the [release workflow](/.github/workflows/publish.yml).

   Purpose: run the canonical publish pipeline in CI instead of publishing packages and assets from a local machine.

   Outcome: the workflow validates the `cli-v{VERSION}` tag, downloads the compiled binaries from the successful CI run for the same commit, uploads those binaries as Release assets, publishes the npm packages through `nx release publish` with [provenance](https://docs.npmjs.com/generating-provenance-statements) via GitHub OIDC, and updates `agentxm/homebrew-tap` when `HOMEBREW_TAP_TOKEN` is configured.

`pnpm release` remains an alias for `pnpm release:prepare`.

### Notes

- Release tags must use the `cli-v{SEMVER}` format, for example `cli-v0.1.0`.
- If the tag version and package manifest versions do not match, the Release workflow fails fast.
- Do not create GitHub Releases manually. Use `pnpm release:publish cli-v{VERSION}` after CI is green.
- Do not publish packages locally as the normal release path; GitHub Actions is the canonical publisher.
- Homebrew automation requires the `HOMEBREW_TAP_TOKEN` repository secret in `agentxm/axm`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
