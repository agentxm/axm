# Contributing to AXM

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- [mise](https://mise.jdx.dev/) (manages Node.js 22.x, pnpm 10.29.3, and Bun 1.3.5 from `mise.toml`)
- [Nx](https://nx.dev/) (installed as a devDependency — no global install needed)

### Setup

After installing and activating `mise` in your shell, run:

```bash
mise install             # install Node.js, Bun, and pnpm from mise.toml
pnpm install             # install all workspace dependencies
pnpm build               # build all packages
pnpm test                # run tests
```

### Useful Commands

Most commands delegate to Nx for caching and dependency-aware orchestration.
Formatting does not: `pnpm format` and `pnpm format:check` are the canonical
full-repo Prettier commands. Use `pnpm format:affected` or
`pnpm format:check:affected` only as Nx convenience commands for changed-file
ranges.

| Command                      | Purpose                                   |
| ---------------------------- | ----------------------------------------- |
| `pnpm build`                 | Build all packages                        |
| `pnpm test`                  | Run all tests                             |
| `pnpm test:e2e`              | Run E2E tests only                        |
| `pnpm typecheck`             | Type-check without emitting               |
| `pnpm format`                | Format the whole repo with Prettier       |
| `pnpm format:check`          | Check whole-repo formatting with Prettier |
| `pnpm format:affected`       | Format only Nx-selected changed files     |
| `pnpm format:check:affected` | Check only Nx-selected changed files      |
| `pnpm lint`                  | Lint with ESLint                          |
| `pnpm lint:fix`              | Lint and auto-fix                         |
| `pnpm run ci`                | Run the full CI pipeline locally          |
| `pnpm run ci:affected`       | Run CI pipeline for affected packages     |
| `pnpm build:affected`        | Build only packages changed since `main`  |
| `pnpm test:affected`         | Test only packages changed since `main`   |
| `pnpm lint:affected`         | Lint only packages changed since `main`   |

## Making Changes

1. Fork the repo and create a branch from `main`.
2. Make your changes.
3. Add or update tests for any new or changed behavior.
4. Ensure CI passes locally: `pnpm run ci`.
5. Open a pull request against `main`.

### Code Style

- **TypeScript** in strict mode with [Effect](https://effect.website/) as the standard library.
- **Prettier** is the formatting source of truth. `pnpm format` and
  `pnpm format:check` are the canonical commands. Nx format commands are
  affected-file conveniences only.
- **ESLint** handles linting and runs in CI.
- Co-locate tests with the code they test (`feature.ts` + `feature.test.ts` in the same directory).
- CLI E2E coverage lives in dedicated `packages/<cli>-e2e/` projects and runs against built artifacts.

## Releasing

See the [Releasing Guide](contributing/guides/releasing.md) for versioning, the release flow, and how to inspect release and CI state.

Releases are published from GitHub Actions. `pnpm release:prepare` is the only supported way to cut a release commit locally.

## License

By contributing, you agree that your contributions will be licensed under the [Functional Source License, Version 1.1, MIT Future License (FSL-1.1-MIT)](LICENSE).
