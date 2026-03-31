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

| Command               | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `pnpm build`          | Build all packages                       |
| `pnpm test`           | Run all tests                            |
| `pnpm test:e2e`       | Run E2E tests only                       |
| `pnpm typecheck`      | Type-check without emitting              |
| `pnpm format`         | Format code and markdown                 |
| `pnpm format:check`   | Check formatting without writing         |
| `pnpm lint`           | Lint with ESLint                         |
| `pnpm lint:fix`       | Lint and auto-fix                        |
| `pnpm build:affected` | Build only packages changed since `main` |
| `pnpm test:affected`  | Test only packages changed since `main`  |
| `pnpm lint:affected`  | Lint only packages changed since `main`  |

## Making Changes

1. Fork the repo and create a branch from `main`.
2. Make your changes.
3. Add or update tests for any new or changed behavior.
4. Ensure CI passes: `pnpm nx run-many -t build typecheck test e2e lint format-check`.
5. Open a pull request against `main`.

### Code Style

- **TypeScript** in strict mode with [Effect](https://effect.website/) as the standard library.
- **Prettier** for formatting, **ESLint** for linting — both run in CI.
- Co-locate tests with the code they test (`feature.ts` + `feature.test.ts` in the same directory).
- CLI E2E coverage lives in dedicated `packages/<cli>-e2e/` projects and runs against built artifacts.

## Releasing

Releases are published to npm as `@axm.sh/cli`. You can publish locally or via CI.

### Versioning

We follow [semver](https://semver.org/):

- **patch** (0.1.0 → 0.1.1) — bug fixes, documentation
- **minor** (0.1.1 → 0.2.0) — new features, backward-compatible changes
- **major** (0.2.0 → 1.0.0) — breaking changes to CLI flags, config format, or public API

### Publishing Locally

Requires `npm login` with publish access to the `@axm.sh` scope.

```bash
pnpm nx run-many -t build typecheck test e2e lint
pnpm --filter @axm.sh/core exec npm version patch --no-git-tag-version
pnpm --filter @axm.sh/cli exec npm version patch --no-git-tag-version
pnpm nx run core:publish
pnpm nx run cli:publish
git add packages/core/package.json packages/cli/package.json
git commit -m "release: cli-v0.1.1"
git tag cli-v0.1.1
git push origin main --tags
gh release create cli-v0.1.1 --title "cli v0.1.1" --generate-notes  # optional
```

### Publishing via CI

The [release workflow](/.github/workflows/publish.yml) runs automatically when a GitHub Release is published. It validates the `cli-v{VERSION}` tag, downloads the compiled binaries from the successful CI run for the same commit, uploads those binaries as Release assets, publishes `@axm.sh/core` and `@axm.sh/cli` to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements) via GitHub OIDC, and updates `agentxm/homebrew-tap` when `HOMEBREW_TAP_TOKEN` is configured.

```bash
pnpm nx run-many -t build typecheck test e2e lint
pnpm --filter @axm.sh/core exec npm version minor --no-git-tag-version
pnpm --filter @axm.sh/cli exec npm version minor --no-git-tag-version
git add packages/core/package.json packages/cli/package.json
git commit -m "release: cli-v0.2.0"
git push origin main
gh release create cli-v0.2.0 --title "cli v0.2.0" --generate-notes
```

### Notes

- Tags must match the version in both package manifests with a `cli-v` prefix (e.g., `cli-v0.1.0`).
- Use `patch`, `minor`, or `major` with `npm version` per [semver](https://semver.org/).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
