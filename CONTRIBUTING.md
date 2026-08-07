# Contributing to AXM

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- [mise](https://mise.jdx.dev/) (manages Node.js 22.23.2, pnpm 11.20.0, and Bun 1.3.14 from `mise.toml`)
- [Nx](https://nx.dev/) (installed as a devDependency — no global install needed)

### Setup

The documented default for Linux development is the shared Docker environment:

```bash
scripts/container-environment.sh shell
```

For native development, install and activate `mise`, then run:

```bash
mise install             # install Node.js, Bun, and pnpm from mise.toml
pnpm install             # install all workspace dependencies
pnpm build               # build all packages
pnpm test                # run tests
```

The development image, repository-owned CI image, identity storage, and
native-platform boundaries are documented in the
[Development Environment Guide](contributing/guides/development-environment.md).
Automated review behavior and maintainer controls are documented in the
[Automated Pull Request Review Guide](contributing/guides/automated-pull-request-review.md).

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
| `pnpm run container:ci`      | Run full CI in the pinned Linux image     |
| `pnpm run container:dev`     | Open the shared Linux development image   |
| `pnpm build:affected`        | Build only packages changed since `main`  |
| `pnpm test:affected`         | Test only packages changed since `main`   |
| `pnpm lint:affected`         | Lint only packages changed since `main`   |

## Making Changes

1. External contributors fork the repo; maintainers work from the main
   repository. In both cases, create a branch from current `main` before the
   first file edit.
2. Make your changes.
3. Add or update tests for any new or changed behavior.
4. Ensure CI passes locally: `pnpm run ci`.
5. Open a pull request against `main`.

Never edit, commit, or push directly on `main`. All changes land through pull
requests. Use a separate worktree for concurrent tasks or coding-agent sessions
so the primary checkout can remain clean on `main`.

### Public repository privacy

This repository is public. Branch names, commits, issues, pull requests,
comments, screenshots, and release notes must not contain identifiers, links,
titles, descriptions, or comments from private trackers such as Linear. They
must also not expose private repository links, customer details, unreleased
internal plans, credentials, or other confidential context.

Use a public-safe branch name such as `feat/registry-auth` rather than one that
contains a private issue identifier. Every pull request must explain the public
problem and solution without requiring access to a private tracker or
repository. When public discussion is useful, create or reference a sanitized
GitHub issue.

Cross-repository work still uses an independent AXM branch and pull request.
Describe only the public contract or released dependency on this side; keep
private coordination and private PR links in the internal system.

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
