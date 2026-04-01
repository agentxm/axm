# Contributing to axm

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
| `pnpm run ci`          | Run the full CI pipeline locally         |
| `pnpm run ci:affected` | Run CI pipeline for affected packages    |
| `pnpm build:affected`  | Build only packages changed since `main` |
| `pnpm test:affected`   | Test only packages changed since `main`  |
| `pnpm lint:affected`   | Lint only packages changed since `main`  |

## Making Changes

1. Fork the repo and create a branch from `main`.
2. Make your changes.
3. Add or update tests for any new or changed behavior.
4. Ensure CI passes locally: `pnpm run ci`.
5. Open a pull request against `main`.

### Code Style

- **TypeScript** in strict mode with [Effect](https://effect.website/) as the standard library.
- **Prettier** for formatting, **ESLint** for linting — both run in CI.
- Co-locate tests with the code they test (`feature.ts` + `feature.test.ts` in the same directory).
- CLI E2E coverage lives in dedicated `packages/<cli>-e2e/` projects and runs against built artifacts.

## Releasing

See the [Releasing Guide](contributing/guides/releasing.md) for versioning, the release flow, and how to inspect release and CI state.

Releases are published from GitHub Actions. `pnpm release:prepare` is the only supported way to cut a release commit locally.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
