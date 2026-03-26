# E2E Test Projects Plan

## Context

We have two CLIs (`cli` and `cli-spike`) intended for wide distribution as Bun
redistributables and npm packages. `cli-spike-e2e` already exists as a
distribution E2E project for the spike. This plan covers:

1. Creating `cli-e2e` for the main CLI
2. File organization conventions for E2E projects
3. Sharing utilities across E2E projects without depending on `@axm.sh/core`

---

## 1. Create `cli-e2e`

### Scope

A new `packages/cli-e2e/` Nx project that tests the **built** `@axm.sh/cli`
artifact. Same pattern as `cli-spike-e2e` — zero internal source dependencies,
spawns `packages/cli/dist/src/main.ts` as a subprocess.

### Relationship to co-located E2E tests

The 27 existing co-located E2E tests in `packages/cli/src/` stay where they are.
They serve a different purpose:

| | Co-located (`packages/cli/src/**/*.e2e.test.ts`) | Distribution (`packages/cli-e2e/`) |
|---|---|---|
| Tests | Source via `bun run src/main.ts` | Built artifact via `dist/` |
| Purpose | Dev-time regression | Pre-release artifact verification |
| Fixtures | `packages/cli/src/e2e/fixtures/` (relative imports) | Own `fixtures/` dir (self-contained) |
| Runs | `pnpm test:e2e` (every PR) | `pnpm nx e2e cli-e2e` (pre-release) |

Over time, distribution tests may grow to replace some co-located tests, but
both levels have value and can coexist.

### Files to create

```
packages/cli-e2e/
  package.json
  project.json
  vitest.config.ts
  tsconfig.json
  tsconfig.spec.json
  src/
    utils.ts              # Spawns cli/dist/src/main.js
    fixtures/             # Self-contained test fixtures
      skills-repo/        # Copied from packages/cli/src/e2e/fixtures/skills-repo
        my-skill/SKILL.md
        another-skill/SKILL.md
    smoke.e2e.test.ts     # --help, --version, exit codes, subcommand listing
    init.e2e.test.ts      # Workspace initialization
    skills.e2e.test.ts    # Install, list, uninstall workflows
```

### `project.json`

```json
{
  "name": "cli-e2e",
  "projectType": "application",
  "root": "packages/cli-e2e",
  "sourceRoot": "packages/cli-e2e/src",
  "tags": ["type:e2e", "scope:cli"],
  "targets": {
    "e2e": {
      "dependsOn": ["cli:build"],
      "executor": "@nx/vitest:test",
      "options": {
        "configFile": "packages/cli-e2e/vitest.config.ts"
      }
    }
  }
}
```

Key: `dependsOn: ["cli:build"]` ensures the artifact exists before tests run.

### `package.json`

```json
{
  "name": "@axm.sh/cli-e2e",
  "version": "0.0.1",
  "private": true,
  "description": "Distribution E2E tests for the axm CLI",
  "type": "module",
  "devDependencies": {
    "execa": "^9.6.1",
    "typescript": "catalog:",
    "vitest": "catalog:",
    "yaml": "^2.8.2"
  }
}
```

Note: `yaml` is a direct devDependency here (not via `@axm.sh/core`) because
some tests parse lockfiles to verify structure. This is intentional — E2E
projects must not depend on internal packages.

### `utils.ts`

Spawns `packages/cli/dist/src/main.js` (the build output). Same shape as
`cli-spike-e2e/src/utils.ts` but pointed at the main CLI artifact. Includes
`FIXTURES_PATH` and `copySkillsRepoFixture` for tests that need fixture data.

---

## 2. File organization for E2E projects

### Convention

```
packages/<cli>-e2e/
  package.json            # Private, devDeps only (execa, vitest, yaml)
  project.json            # type:e2e tag, e2e target depends on <cli>:build
  vitest.config.ts        # *.e2e.test.ts pattern, 30s timeout
  tsconfig.json           # Three-file pattern (no tsconfig.lib.json)
  tsconfig.spec.json      # Includes src/**/*.ts and vitest.config.ts
  src/
    utils.ts              # CLI runner + temp dir helpers (CLI-specific)
    fixtures/             # Self-contained test data (no symlinks to source)
    smoke.e2e.test.ts     # Minimum viable: --help, --version, unknown cmd
    <feature>.e2e.test.ts # One file per feature area, not per subcommand
```

### Naming

- Package: `@axm.sh/<cli>-e2e` (e.g., `@axm.sh/cli-e2e`, `@axm.sh/cli-spike-e2e`)
- Nx project name: `<cli>-e2e` (e.g., `cli-e2e`, `cli-spike-e2e`)
- Nx tags: `["type:e2e", "scope:<cli>"]`

### Test file granularity

Distribution E2E tests are organized **by feature area**, not by subcommand.
Each test file covers a user workflow, not a single command in isolation:

```
smoke.e2e.test.ts       # CLI basics: help, version, unknown commands
init.e2e.test.ts        # Workspace initialization and structure
skills.e2e.test.ts      # Install → list → update → uninstall flow
auth.e2e.test.ts        # Login, token, whoami
output.e2e.test.ts      # Structured output modes (text, json, stream-json)
```

This differs from co-located tests (one file per subcommand) because
distribution tests verify end-to-end workflows rather than individual command
behavior.

### Fixtures are self-contained

Each E2E project owns its fixtures — no symlinks or references to source-package
fixtures. This ensures:

- E2E project has zero coupling to CLI source tree
- Fixtures can diverge if distribution tests need different data
- The E2E project remains portable (could be extracted to a separate repo)

### No `tsconfig.lib.json`

E2E projects have nothing to build — they're test-only. The three-file pattern
is `tsconfig.json` (root references) and `tsconfig.spec.json` (test files).

---

## 3. Sharing E2E utilities without depending on core

### Problem

Both `cli-e2e` and `cli-spike-e2e` need the same utilities:

- `CliResult` interface
- `RunCliOptions` interface
- `TempDirContext` interface
- `createTempDir()` function
- `run()` subprocess spawner (the `execa` wrapper)
- `copyFixture()` pattern

Currently these are duplicated. As more E2E projects appear (e.g., for a future
`axm-dev` CLI), this duplication grows.

### Constraint

E2E projects must **not** depend on `@axm.sh/core`. Core is a production
library with Effect, platform dependencies, and domain types. E2E utilities are
plain TypeScript + `execa` — pulling in core would defeat the purpose of testing
the built artifact in isolation.

### Options

#### a) Duplicate utilities across E2E projects

Keep each E2E project self-contained with its own `utils.ts`. Accept duplication.

- **Pro:** Zero coupling, each project is fully independent
- **Pro:** Simplest — no new packages, no coordination
- **Con:** Bug fixes or improvements must be applied to each copy
- **Con:** Duplication grows linearly with CLI count

#### b) Create `@axm.sh/e2e-utils` — a shared test utilities package

A new `packages/e2e-utils/` package that exports the shared interfaces and
helpers. E2E projects depend on it instead of duplicating.

```
packages/
  e2e-utils/              # @axm.sh/e2e-utils — shared E2E test utilities
    package.json          # Private, deps: execa
    project.json          # type:lib, scope:test
    src/
      index.ts            # Barrel export
      runner.ts           # createCliRunner(artifactPath) factory
      temp-dir.ts         # createTempDir, TempDirContext
      fixtures.ts         # copyFixture helper
      types.ts            # CliResult, RunCliOptions
  cli-e2e/
    package.json          # devDeps: @axm.sh/e2e-utils
    src/
      utils.ts            # const runCli = createCliRunner("../cli/dist/src/main.js")
  cli-spike-e2e/
    package.json          # devDeps: @axm.sh/e2e-utils
    src/
      utils.ts            # const runCli = createCliRunner("../cli-spike/dist/src/main.js")
```

The key API: `createCliRunner(artifactPath)` — a factory that returns a
`runCli` function bound to a specific CLI artifact path. Each E2E project
calls it once with its artifact path.

```typescript
// e2e-utils/src/runner.ts
export const createCliRunner = (artifactPath: string) => {
  const resolvedPath = path.resolve(import.meta.dirname, artifactPath);
  return async (
    args: ReadonlyArray<string>,
    options: RunCliOptions = {},
  ): Promise<CliResult> => {
    // ... execa spawn logic
  };
};
```

```typescript
// cli-e2e/src/utils.ts
import { createCliRunner, createTempDir } from "@axm.sh/e2e-utils";

export const runCli = createCliRunner("../../cli/dist/src/main.js");
export { createTempDir };
```

- **Pro:** Single source of truth for utilities
- **Pro:** E2E projects stay thin — just artifact path + fixtures
- **Pro:** No dependency on core, Effect, or any production code
- **Con:** One more package to maintain
- **Con:** Coordination overhead (changes to utils affect all E2E projects)

#### c) Workspace-internal `e2e/` directory (not a package)

A shared directory at the repo root (e.g., `e2e/utils/`) that E2E projects
import via TypeScript path aliases. Not an npm package — just shared source.

- **Pro:** No new package, no publish concerns
- **Con:** TypeScript path aliases add config complexity
- **Con:** Nx doesn't track non-package directories well
- **Con:** Breaks if E2E projects are ever extracted to a separate repo

### Recommendation

**(b) `@axm.sh/e2e-utils`** — but defer creation until `cli-e2e` is built.

Right now there are only two E2E projects. Start by duplicating (option a) when
creating `cli-e2e`. When the third E2E project appears — or when a non-trivial
utility change needs to be applied to both — extract the shared code into
`@axm.sh/e2e-utils` at that point.

This follows the project's own principle: "Don't create helpers, utilities, or
abstractions for one-time operations. Don't design for hypothetical future
requirements."

### Implementation sequence

1. Create `cli-e2e` with its own `utils.ts` (duplicate from `cli-spike-e2e`,
   point at `cli/dist/src/main.js`)
2. Copy fixtures from `packages/cli/src/e2e/fixtures/` into
   `packages/cli-e2e/src/fixtures/` (self-contained)
3. Write smoke tests + key workflow tests
4. When a third E2E project is needed, extract shared code into
   `@axm.sh/e2e-utils` using the `createCliRunner` factory pattern
