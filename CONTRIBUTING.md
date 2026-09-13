# Contributing to AXM

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- [mise](https://mise.jdx.dev/) (manages Node.js 22.23.2, pnpm 11.20.0, and Bun 1.3.14 from `mise.toml`)
- [Nx](https://nx.dev/) (installed as a devDependency — no global install needed)

### Setup

Install and activate `mise`, then run:

```bash
mise install             # install Node.js, Bun, and pnpm from mise.toml
pnpm install             # install all workspace dependencies
pnpm build               # build all packages
pnpm test                # run tests
```

Start with [native development](devops/environments/native-development.md),
[Linux CI](devops/environments/linux-ci.md), and
[native platform CI](devops/environments/native-platform-ci.md) for execution boundaries.
[Engineering and operations](devops/index.md) also covers tools, providers,
release procedures, and engineering measures.
Automated review behavior and maintainer controls are documented in the
[Automated Pull Request Review Guide](devops/playbooks/automated-pr-review.md).

### Useful Commands

Most commands delegate to Nx for caching and dependency-aware orchestration.
Formatting does not: `pnpm format` and `pnpm format:check` are the canonical
full-repo Prettier commands. Use `pnpm format:affected` or
`pnpm format:check:affected` only as Nx convenience commands for changed-file
ranges.

Before adding a script, an Nx target, or a wrapper script, read the
[Repository task interface](docs/guides/repository-task-interface.md). It decides
which of the three a new piece of work belongs in, and records every deliberate
exception.

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
| `pnpm run verify:affected`   | Run fast source checks selected by Nx     |
| `pnpm run verify:pr`         | Verify the complete pull-request boundary |
| `pnpm run ci`                | Run full-workspace automation diagnostics |
| `pnpm build:affected`        | Build only packages changed since `main`  |
| `pnpm test:affected`         | Test only packages changed since `main`   |
| `pnpm lint:affected`         | Lint only packages changed since `main`   |

## Making Changes

Before changing AXM product behavior, read the relevant
[architecture documents](docs/architecture/index.md). They explain command
responsibilities, workspace invariants, and design rationale; the executable
specifications in the [specification catalog](specifications/catalog.md) own
required behavior, and code and tests show how the design is implemented.

An executable specification is a `*.spec.ts` file beside the source it
specifies, inside the project that owns that source, and it runs in that
project's `test` target. Before adding, moving, or retiring one, read
[Executable specifications](contributing/guides/executable-specifications.md).

Pull-request CI renders the specification verdict against the same affected
base used by verification. It lists added, removed, and revised requirement
identities, or renders `No requirement contract changes.` A removed identity
needs an entry in `specifications/disposition-ledger.json`; an unexplained
removal renders as one.

Landing changes through short-lived pull requests with passing aggregate
verification is repository policy. GitHub requires pull requests for `main`, a
successful `Required CI` check produced by GitHub Actions against the current
merge base, resolved conversations, linear history, and squash integration;
the same rules bind administrators. Maintainer-authored changes need an explicit
acceptance decision but not a second human reviewer, so the host requires zero
approving reviews. External contributions still require maintainer acceptance
as a process boundary because GitHub Team cannot require that conditionally
without also requiring a second reviewer for maintainer-authored work.

1. External contributors fork the repo; maintainers work from the main
   repository. In both cases, create a branch from current `main` before the
   first file edit.
2. Make your changes.
3. Add or update tests for any new or changed behavior.
4. Verify the complete change boundary: `pnpm run verify:pr`.
5. Open a pull request against `main`. Maintainers may enable auto-merge after
   acceptance; GitHub merges only after the current-base required check passes.

Do not edit, commit, or push directly on `main`. Use a separate worktree for
concurrent tasks or coding-agent sessions so the primary checkout can remain
clean on `main`. Remove the disposable worktree and local branch after the pull
request merges and its commits are preserved.

For a coding agent, a request to deliver or complete a change authorizes the
routine branch, worktree, commit, push, pull-request, approved auto-merge, and
post-merge cleanup operations needed for that delivery. Requests limited to
analysis or implementation do not. Publishing a release, deploying to
production, rewriting shared history, or acting outside the named delivery
requires explicit authorization.

### Public repository privacy

The binding obligation is the executable specification
`system/process/public-artifacts-protect-private-context` in the
[specification catalog](specifications/catalog.md).

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
- Executable specifications colocate the same way (`feature.spec.ts`) and bind
  to their subject through the owning package's root export or another
  package's `./testing` subpath — never a path into another package's `src`.
- Libraries live in `packages/<domain>/<name>` where `<domain>` is `core`,
  `supporting`, or `generic`. The directory is the authority: Nx infers the
  `domain:*` tag from it, and ESLint enforces dependency direction from the
  inferred domain plus the project's authored `role:*` tag.
- CLI E2E coverage lives in dedicated `apps/<cli>-e2e/` projects and runs against built artifacts.

## Releasing

See the [Releasing Guide](devops/runbooks/release-cli.md) for versioning, the release flow, and how to inspect release and CI state.

Release candidates are prepared and releases are published from GitHub Actions.
The release runbook owns the explicit preparation dispatch and exact-source
requirements; local checkouts do not cut release commits.

## License

By contributing, you agree that your contributions will be licensed under the [Functional Source License, Version 1.1, MIT Future License (FSL-1.1-MIT)](LICENSE).
