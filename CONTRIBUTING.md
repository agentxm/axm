# Contributing to AXM

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- [mise](https://mise.jdx.dev/) (manages Node.js, pnpm, and Bun from `mise.toml`)
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

| Need                                         | Command                               |
| -------------------------------------------- | ------------------------------------- |
| Check one project or task                    | `pnpm exec nx run <project>:<target>` |
| Verify changed source before merge           | `pnpm run verify:affected`            |
| Reproduce the complete pull-request boundary | `pnpm run verify:pr`                  |
| Run full-workspace automation diagnostics    | `pnpm run ci`                         |
| Format the workspace                         | `pnpm run format`                     |

[package.json](package.json) and the resolved Nx graph own the complete command
inventory. The [task-interface binding](docs/guides/repository-task-interface.md#workflow-outcomes)
explains which outcome each workflow establishes; test reports restored from
cache are earlier input-bound verdicts, not fresh executions on this host.

## Making Changes

Use an isolated branch/worktree. Commit and push unfinished work freely for
handoff; no repository checks run on commits or non-main pushes. Include the
branch, exact SHA, remaining work, and verification state when handing off.

Trusted maintainers integrate accepted changes locally after formatting and
verification against current main. The destination-main pre-push hook runs
`pnpm run verify:integration`; non-fast-forward pushes are rejected. PRs are
optional for maintainer collaboration and request hosted CI. External
contributors submit a PR for maintainer acceptance.

[Integrate changes](devops/runbooks/integrate-changes.md) owns the complete
procedure, GitHub controls, failure recovery, and cleanup. Release preparation
and publication continue through the [release runbook](devops/runbooks/release-cli.md).
A delivery request authorizes routine Git integration and cleanup, but not
release publication, production deployment, or shared-history rewriting.

### Public repository privacy

The binding obligation is the executable specification
`system/process/public-artifacts-protect-private-context` in the
[specification catalog](specifications/catalog.md).

This repository is public. Branch names, commits, issues, pull requests,
comments, screenshots, and release notes must not contain identifiers, links,
titles, descriptions, or comments from private trackers such as Linear. They
must also not expose private repository links, customer details, unreleased
internal plans, credentials, or other confidential context.

Use a public-safe branch name such as `feat/registry-access` rather than one that
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
