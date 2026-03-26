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

### Migration of co-located E2E tests

The 27 existing co-located E2E tests in `packages/cli/src/**/*.e2e.test.ts` will
be migrated into `cli-e2e`. All E2E tests belong in the dedicated E2E project —
no co-located E2E tests remain in CLI source packages.

Benefits of consolidation:

- **Single place** for all E2E tests per CLI — no split between two locations
- **Tests the built artifact** — catches build/bundle failures that source-level
  tests miss
- **Decoupled from source** — E2E project has zero imports from CLI internals
- **Clearer test pyramid** — unit tests in CLI packages, E2E tests in E2E packages

### Files to create

```
packages/cli-e2e/
  package.json
  project.json
  vitest.config.ts
  tsconfig.json
  tsconfig.spec.json
  src/
    utils.ts              # Binds @axm.sh/e2e-utils to cli artifact path
    fixtures/             # Self-contained test fixtures (migrated from cli source)
      skills-repo/        # From packages/cli/src/e2e/fixtures/skills-repo
        my-skill/SKILL.md
        another-skill/SKILL.md
    smoke.e2e.test.ts     # --help, --version, exit codes, subcommand listing
    init.e2e.test.ts      # Workspace initialization
    skills.e2e.test.ts    # Install, list, uninstall workflows
    # + migrated tests from packages/cli/src/**/*.e2e.test.ts
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
    "@axm.sh/e2e-utils": "workspace:*",
    "typescript": "catalog:",
    "vitest": "catalog:",
    "yaml": "^2.8.2"
  }
}
```

Note: `yaml` is a direct devDependency (not via `@axm.sh/core`) because some
tests parse lockfiles to verify structure. E2E projects depend only on
`@axm.sh/e2e-utils` (shared test utilities) — never on production packages.

### `utils.ts`

Thin wrapper that binds `@axm.sh/e2e-utils` to the `cli` artifact path:

```typescript
import { createCliRunner, createTempDir } from "@axm.sh/e2e-utils";

export const runCli = createCliRunner("../../cli/dist/src/main.js");
export { createTempDir };

export const FIXTURES_PATH = new URL("fixtures/", import.meta.url).pathname;
```

Also exports `FIXTURES_PATH` and `copySkillsRepoFixture` for tests that need
fixture data.

---

## 2. File organization for E2E projects

### Convention

```
packages/<cli>-e2e/
  package.json            # Private, devDeps: @axm.sh/e2e-utils, vitest, yaml
  project.json            # type:e2e tag, e2e target depends on <cli>:build
  vitest.config.ts        # *.e2e.test.ts pattern, 30s timeout
  tsconfig.json           # Three-file pattern (no tsconfig.lib.json)
  tsconfig.spec.json      # Includes src/**/*.ts and vitest.config.ts
  src/
    utils.ts              # Binds @axm.sh/e2e-utils to CLI artifact path
    fixtures/             # Self-contained test data (no symlinks to source)
    smoke.e2e.test.ts     # Minimum viable: --help, --version, unknown cmd
    <feature>.e2e.test.ts # One file per feature area, not per subcommand
```

### Naming

- Package: `@axm.sh/<cli>-e2e` (e.g., `@axm.sh/cli-e2e`, `@axm.sh/cli-spike-e2e`)
- Nx project name: `<cli>-e2e` (e.g., `cli-e2e`, `cli-spike-e2e`)
- Nx tags: `["type:e2e", "scope:<cli>"]`

### Test file granularity

E2E tests are organized **by feature area**, not by subcommand. Each test file
covers a user workflow, not a single command in isolation:

```
smoke.e2e.test.ts       # CLI basics: help, version, unknown commands
init.e2e.test.ts        # Workspace initialization and structure
skills.e2e.test.ts      # Install → list → update → uninstall flow
auth.e2e.test.ts        # Login, token, whoami
output.e2e.test.ts      # Structured output modes (text, json, stream-json)
```

When migrating co-located tests (previously one file per subcommand), consolidate
related tests into the appropriate feature-area file.

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

## 3. Shared E2E utilities — `@axm.sh/e2e-utils`

### Constraint

E2E projects must **not** depend on `@axm.sh/core`. Core is a production
library with Effect, platform dependencies, and domain types. E2E utilities are
plain TypeScript + `execa` — pulling in core would defeat the purpose of testing
the built artifact in isolation.

### Approach

A new `packages/e2e-utils/` package (`@axm.sh/e2e-utils`) provides shared
interfaces and helpers. E2E projects depend on it instead of duplicating.

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

### Key API

`createCliRunner(artifactPath)` — a factory that returns a `runCli` function
bound to a specific CLI artifact path. Each E2E project calls it once with its
artifact path.

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

### Shared utilities

| Export | Source file | Purpose |
|---|---|---|
| `createCliRunner` | `runner.ts` | Factory returning a `runCli` fn bound to an artifact path |
| `CliResult` | `types.ts` | Subprocess result: stdout, stderr, exitCode |
| `RunCliOptions` | `types.ts` | Options: cwd, env, timeout |
| `TempDirContext` | `temp-dir.ts` | Test context with temp dir path + cleanup |
| `createTempDir` | `temp-dir.ts` | Creates isolated temp dir, returns `TempDirContext` |
| `copyFixture` | `fixtures.ts` | Copies a fixture directory into a temp dir |

---

## 4. Implementation plan

### Phase 1 — Create `@axm.sh/e2e-utils`

Extract shared utilities from `cli-spike-e2e/src/utils.ts` into a reusable
package.

- [x] Create `packages/e2e-utils/package.json` (private, deps: `execa`)
- [x] Create `packages/e2e-utils/project.json` (tags: `type:lib`, `scope:test`)
- [x] Create `packages/e2e-utils/tsconfig.json` + `tsconfig.spec.json`
- [x] Create `src/types.ts` — `CliResult`, `RunCliOptions` interfaces
- [x] Create `src/temp-dir.ts` — `TempDirContext`, `createTempDir()`
- [x] Create `src/fixtures.ts` — `copyFixture()` helper
- [x] Create `src/runner.ts` — `createCliRunner(artifactPath)` factory
- [x] Create `src/index.ts` — barrel export
- [x] Verify: `pnpm install` succeeds, `pnpm typecheck` passes

### Phase 2 — Migrate `cli-spike-e2e` to `e2e-utils`

Replace inline utilities with imports from the shared package.

- [x] Add `@axm.sh/e2e-utils: "workspace:*"` to `cli-spike-e2e` devDependencies
- [x] Remove `execa` from `cli-spike-e2e` devDependencies
- [x] Rewrite `cli-spike-e2e/src/utils.ts` to bind `createCliRunner` to
      `../../cli-spike/dist/src/main.js`
- [x] Run `pnpm install`
- [x] Verify: `pnpm nx e2e cli-spike-e2e` passes (existing smoke test still works)

### Phase 3 — Create `cli-e2e` project scaffold

Stand up the new E2E project with boilerplate and initial smoke test.

Progress note: scaffold is complete and verified. `cli-e2e` now runs successfully against the built CLI artifact.

- [x] Create `packages/cli-e2e/package.json` (devDeps: `@axm.sh/e2e-utils`,
      `vitest`, `typescript`, `yaml`)
- [x] Create `packages/cli-e2e/project.json` (tags: `type:e2e`, `scope:cli`;
      `e2e` target with `dependsOn: ["cli:build"]`)
- [x] Create `packages/cli-e2e/vitest.config.ts` (`*.e2e.test.ts` pattern, 30s
      timeout)
- [x] Create `packages/cli-e2e/tsconfig.json` + `tsconfig.spec.json`
- [x] Create `src/utils.ts` — bind `createCliRunner` to
      `../../cli/dist/src/main.js`, export `FIXTURES_PATH`
- [x] Copy `packages/cli/src/e2e/fixtures/` into
      `packages/cli-e2e/src/fixtures/` (self-contained copy)
- [x] Create `src/smoke.e2e.test.ts` — `--help`, `--version`, unknown command,
      exit codes
- [x] Run `pnpm install`
- [x] Verify: `pnpm nx e2e cli-e2e` passes smoke tests against built artifact

### Phase 4 — Migrate co-located E2E tests into `cli-e2e`

Move the 27 existing co-located tests, consolidating by feature area. Each
migrated test must pass against the built artifact before the co-located
original is removed.

Progress note: all 27 source E2E files are copied into `cli-e2e` as non-entry modules, wired through feature-area entry files, and verified against the built artifact.

**Smoke & top-level** (→ `smoke.e2e.test.ts`)
- [x] Migrate `src/command.e2e.test.ts` (root CLI tests)
- [x] Migrate `src/cli-commands/structured-output.e2e.test.ts`

**Init** (→ `init.e2e.test.ts`)
- [x] Migrate `src/cli-commands/init/command.e2e.test.ts`

**Skills** (→ `skills.e2e.test.ts`)
- [x] Migrate `src/cli-commands/skills/command.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/install/command.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/install/preview.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/install/registry-install.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/install/rebuild-lockfile.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/list/command.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/uninstall/command.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/uninstall/registry-uninstall.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/update/command.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/enable/command.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/disable/command.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/new/command.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/rename/command.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/fork/fork.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/fork/registry-guard.e2e.test.ts`
- [x] Migrate `src/cli-commands/skills/publish/publish.e2e.test.ts`

**Auth** (→ `auth.e2e.test.ts`)
- [x] Migrate `src/cli-commands/auth/auth.e2e.test.ts`
- [x] Migrate `src/cli-commands/auth/login/login.e2e.test.ts`
- [x] Migrate `src/cli-commands/auth/logout/logout.e2e.test.ts`
- [x] Migrate `src/cli-commands/auth/whoami/whoami.e2e.test.ts`
- [x] Migrate `src/cli-commands/auth/token/token.e2e.test.ts`

**Packs** (→ `packs.e2e.test.ts`)
- [x] Migrate `src/cli-commands/packs/packs.e2e.test.ts`
- [x] Migrate `src/cli-commands/packs/publish/publish.e2e.test.ts`

**TUI** (→ `tui.e2e.test.ts`)
- [x] Migrate `src/dev-cli-commands/tui/command.e2e.test.ts`

- [x] Verify: `pnpm nx e2e cli-e2e` passes all migrated tests

### Phase 5 — Remove co-located E2E tests and update scripts

Clean up the CLI package and wire `pnpm test:e2e` to E2E project targets.

- [x] Delete all `*.e2e.test.ts` files from `packages/cli/src/`
- [x] Delete `packages/cli/src/e2e/utils.ts` and `packages/cli/src/e2e/utils.test.ts`
- [x] Delete `packages/cli/src/e2e/fixtures/` (now owned by `cli-e2e`)
- [x] Remove E2E-related vitest config from `packages/cli/` (if separate)
- [x] Update root `pnpm test:e2e` script to run `nx run-many -t e2e` (targets
      `cli-e2e` and `cli-spike-e2e`)
- [x] Verify: `pnpm test:e2e` runs both E2E projects
- [x] Verify: `pnpm test` no longer picks up any `*.e2e.test.ts` in CLI packages
- [x] Update CLAUDE.md testing section to reflect new E2E structure

### Post-Implementation Follow-up

- [x] Update CI to run `pnpm test:e2e` explicitly alongside `pnpm test`
- [x] Update publish automation to verify `pnpm test:e2e` before release publish
- [x] Keep pre-commit lightweight and add local E2E enforcement via `.husky/pre-push`
- [x] Update active contributor/testing docs to describe dedicated distribution E2E projects
