# @agentxm/workspace-conventions

Engineering conventions for Nx and pnpm TypeScript workspaces. It provides an
ESLint flat-config preset, `capabilityBoundaries`, that enforces capability
boundaries with
[`eslint-plugin-boundaries`](https://github.com/javierbrea/eslint-plugin-boundaries),
and a [staged commit gate](#staged-commit-gate) for Git pre-commit hooks.

This is engineering support, not runtime code. It ships in the AXM release
cohort so other workspaces can lint against the same conventions, but no
runtime package depends on it. It is unstable: options and rules may change in
any release.

The package is plain ES modules with JSDoc types and is published from source,
so an `eslint.config.mjs` or a Git hook can load it without a build step.

## Capability boundaries

```js
import { capabilityBoundaries } from "@agentxm/workspace-conventions/capability-boundaries";

export default [
  // ...a parser for TypeScript sources, such as typescript-eslint's
  ...capabilityBoundaries({
    rootPath: import.meta.dirname,
    elements: [
      {
        type: "backstage",
        pattern: "packages/*/pricing/src",
        capture: ["strategy"],
        partialMatch: false,
      },
      {
        type: "frontstage",
        pattern: "packages/*/checkout/src",
        capture: ["strategy"],
        partialMatch: false,
      },
      { type: "test-support", pattern: "tools/test-world/src", partialMatch: false },
    ],
    files: ["packages/*/{pricing,checkout}/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
  }),
];
```

Install `eslint-plugin-boundaries` and `eslint-import-resolver-typescript`
beside it; both are peer dependencies.

### Model

Each capability is an `eslint-plugin-boundaries` element whose `type` is
`frontstage` (a consumer-facing workflow) or `backstage` (a capability other
capabilities build on), and whose `strategy` capture (the first wildcard of
its pattern) names its strategic classification. A capability whose strategy
is `generic` may depend only on other generic capabilities. Elements of type `test-support` hold shared test
implementations.

Inside a capability, files take a category from their folder:

| Category      | Files                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test`        | `*.test.*`, `*.spec.*`, `*.shared-spec.*`, `test-helpers.*`, `testing.*`, anything under `test-support/` or `__fixtures__/`, and every `test-support` element |
| `domain`      | `domain/**`                                                                                                                                                   |
| `application` | `application/**`                                                                                                                                              |
| `adapter`     | `adapters/**`                                                                                                                                                 |
| `composition` | `composition/**`                                                                                                                                              |

`roleDescriptors` add file descriptors between the test category and the
folders, for example `domain-api` or `application-api` entries that a package
export map publishes.

The preset then enforces:

- **Dependencies.** A capability may use its own files. Other capabilities are
  reached through their public `domain/index.*` and `application/index.*`
  entries or `domain-api` and `application-api` files. Adapters, composition,
  and tests may import external and Node modules, domain and application files
  only the external modules `policyExternalModules` names, and tests may also
  import `test-support` elements. Composition may also select another
  capability's `adapters/*/index.*` and `composition/index.*`. Domain files
  never depend on application, adapter, composition, or test files;
  application files never depend on adapter, composition, or test files;
  backstage domain and application files never depend on frontstage
  capabilities; and adapters and composition never import tests. Every file
  and dependency must be classified.
- **Placement.** Capability code outside the four role folders and test files
  is rejected.
- **Policy mechanisms.** Domain and application files may not import Effect's
  filesystem and provider modules or read the `fetch` and `process` globals.

### Options

| Option                    | Default            | Effect                                                                                                                                     |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `rootPath`                | required           | Absolute workspace root the patterns are relative to                                                                                       |
| `elements`                | required           | Capability and `test-support` element descriptors                                                                                          |
| `files`                   | required           | Source files the dependency rules lint                                                                                                     |
| `roleDescriptors`         | `[]`               | Extra file descriptors, matched after tests and before the role folders                                                                    |
| `additionalAllows`        | `[]`               | Dependency policies placed after the shared allowances and before the invariant denials                                                    |
| `additionalDenials`       | `[]`               | Dependency policies placed after the invariant denials                                                                                     |
| `policyExternalModules`   | `[]`               | External modules domain and application files may import                                                                                   |
| `policyRestrictedImports` | `[]`               | Further `no-restricted-imports` path entries for domain and application files                                                              |
| `testAccess`              | none               | `{ categories, element? }`: file categories tests may also reach, optionally only in elements matching the `element` selector              |
| `placementFiles`          | `files`            | Files the placement rule checks                                                                                                            |
| `resolverConditions`      | the resolver's own | Export conditions `eslint-import-resolver-typescript` selects, such as a condition that maps workspace packages to their TypeScript source |

`eslint-plugin-boundaries` applies the last matching policy. The preset orders
policies as shared allowances, `additionalAllows`, the invariant denials, then
`additionalDenials`, so an additional allowance can widen what the shared
allowances permit but never override an invariant.

`capabilityFileRules(elements, roleDescriptors)` returns the same file
descriptors the preset uses, for tools that need to classify capability files
the same way.

## Staged commit gate

The staged commit gate checks exactly what Git would commit. It runs a
repository's own ordered checks against the index, then typechecks the staged
projects and their consumers. Unstaged and untracked work stays out of every
check and returns afterwards.

### Install

Add the package and `lint-staged`, a peer dependency, as development
dependencies of the workspace root. The gate also needs Git, Bash, pnpm, and Nx
with a `typecheck` target on the projects it should compile.

Commit two files. The pre-commit hook, for example `.husky/pre-commit`:

```sh
#!/usr/bin/env sh
node node_modules/@agentxm/workspace-conventions/bin/check-staged.mjs scripts/check-staged.checks.sh
```

And the repository's ordered checks, here `scripts/check-staged.checks.sh`, a
Bash script that stops at the first failure:

```bash
#!/usr/bin/env bash
set -euo pipefail
pnpm --config.verify-deps-before-run=error exec lint-staged --no-stash
pnpm --config.verify-deps-before-run=error exec nx run-many -t lint
```

The launcher takes the checks file as its only argument, relative to the
repository root. A missing argument or file fails the commit before anything
is isolated. The root `lint-staged` globs configure any auto-fixes the checks
file runs; the gate ships its own lint-staged configuration for isolation.

Start the launcher with `node` by its path inside `node_modules`, never
through pnpm, a package-manager binary shim, or an Nx target: those parse
workspace manifests that may hold unstaged edits before the gate can isolate
the index. The launcher reads no workspace manifest. It resolves its own gate
script and the installed lint-staged entry point, starts the gate with Bash,
and exits with its status.

### How it works

An empty index skips the gate. Otherwise the gate bootstraps isolation through
the installed lint-staged Node entry point, with lint-staged's native backup
and `--hide-all` restoration: tracked working files match the index and
nonignored untracked files are temporarily removed. Inside that view it runs
the checks file once, then the staged typecheck.

Auto-fixes remain staged even when a later check fails; unstaged work returns
on success or failure. `--no-revert` avoids resetting the index to `HEAD`
during failure recovery, which can collide with an untracked replacement of a
staged deletion. A restoration conflict blocks the commit and retains
lint-staged's recovery evidence; resolve it before retrying. Ignored
dependency installations and generated artifacts keep their normal Nx input
and output contracts.

### Ordering the checks

The checks file is the repository's ordered command list. It runs after
isolation and before the typecheck, so the typecheck reads the index the
checks leave staged. The file decides where auto-fixes run relative to its
other checks. A repository that must reinstall dependencies against the staged
manifests does so as the first command, before any auto-fix and before the
typecheck; otherwise the checks run against the developer's installation, and
`--config.verify-deps-before-run=error` makes pnpm reject one that no longer
matches the staged manifests and lockfile. The gate never reconciles the
developer's installation.

### Staged typecheck

Git's explicit `diff --cached --no-renames` file list is passed to
`nx affected -t typecheck --stdin --nxBail`. Nx owns project selection,
transitive consumer traversal, task prerequisites, and configuration and
dependency impact. Additions and deletions are included; a rename contributes
both paths. Neither ambient `NX_BASE`/`NX_HEAD` nor a branch range selects the
projects. Git paths are read with NUL delimiters and converted to Nx's newline
protocol; a newline in a filename fails explicitly. Lint-staged's `--all` only
ensures the gate runs for deletion-only and symlink-only changes; it does not
select every project.

The typecheck materializes `git write-tree` with `git read-tree --reset -u` in
a disposable detached worktree, clearing inherited Git selectors so a pathspec
commit's temporary index does not select another worktree's files.
`pnpm install --frozen-lockfile --offline` reconstructs dependency links
against the staged manifests and lockfile from the local store. Prepare
scripts still run, with `HUSKY=0` so they leave hook configuration alone.
Missing store content or an inconsistent lockfile fails the commit; install
the staged dependency state before retrying. No dependency link points to the
developer's working-tree sources.

Typecheck targets, cache inputs, dependency tasks, and output ownership are the
workspace's own. The gate itself is never cached; typecheck tasks reuse valid
Nx results. The worktree disables the Nx daemon and starts with fresh file
metadata, so rapid index rewrites cannot inherit working-tree file hashes,
while the workspace's task-cache identity and location are preserved. The
worktree is removed on success or failure. A compiler prerequisite that
changes tracked inputs blocks the commit: run generation or `nx sync`, stage
the result, and retry. Full affected verification remains a separate workflow
rather than a per-commit gate.

FSL-1.1-MIT © 2025-2026 AgentXM, Inc.
