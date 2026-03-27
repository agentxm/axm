# Legacy & Deprecated Code Cleanup Plan

Systematic cleanup of legacy code, deprecated APIs, dead code, and convention violations identified by codebase analysis (2026-03-27).

---

## Phase 1: Quick Wins

Low-risk, mechanical changes. Single PR.

### 1.1 Delete unused `help.ts`

`packages/cli/src/help.ts` exports `setRootCommand` and `showHelpFor` — neither is imported anywhere.

- [x] Delete `packages/cli/src/help.ts`
- [x] Remove any barrel export of `help.ts` if present
- [x] Verify build passes

### 1.2 Remove unused `picocolors` dependency

Listed in `packages/core/package.json` but never imported in any source file.

- [x] Remove `picocolors` from `packages/core/package.json` dependencies
- [x] Run `pnpm install` to update lockfile
- [x] Verify build passes

### 1.3 Rename `copySkillDirectory` to `copyExtensionDirectory`

`copySkillDirectory` in `extensions/utils.ts:108` is a deprecated alias for `copyExtensionDirectory`. Used in 31 locations.

- [x] Replace all imports of `copySkillDirectory` with `copyExtensionDirectory` across core and cli packages
- [x] Update `copy-directory.test.ts` to use `copyExtensionDirectory`
- [x] Remove the `copySkillDirectory` alias from `extensions/utils.ts`
- [x] Remove `copySkillDirectory` from `extensions/index.ts` barrel export
- [x] Rebuild to regenerate `.d.ts` barrel exports
- [x] Verify tests pass

### 1.4 Update stale CLAUDE.md ESLint severity

CLAUDE.md says `consistent-type-assertions` and `no-non-null-assertion` are `warn` — both are already `error`. The migration is complete.

- [x] Update CLAUDE.md: change "Currently set to `warn` while existing violations are migrated — will escalate to `error`" to reflect that both rules are now `error`
- [x] Remove the "All new code must be violation-free" caveat (no longer needed since it's enforced)

### 1.5 Remove stale TODO comments

Dead comments referencing completed or removed work.

- [x] Remove TODO comments at `packages/core/src/unstable/workspace/service.test.ts:136-137` (resolvePlan tests already removed during Phase 4 refactoring)

### 1.6 Verify Phase 1

- [x] `pnpm build` passes
- [x] `pnpm test` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes

---

## Phase 2: Wrap Raw Network Calls (TODO #52)

Four source resolution providers use raw `fetch` instead of Effect HttpClient. Single PR — all four providers follow the same pattern (HTTP HEAD to check repo existence).

> **Test gap:** None of the four `resolve-repo.ts`/`repo-exists.ts` files have unit tests. Tests must be written as part of this phase — wrapping with HttpClient changes the dependency graph and untested code cannot be verified by existing tests alone. Nearby `print.test.ts`/`url.test.ts` files test other concerns.

### 2.1 Wrap all four providers

Batch — identical pattern across providers:

- [x] Wrap `providers/github/resolve-repo.ts` with Effect HttpClient
- [x] Wrap `providers/gitlab/resolve-repo.ts` with Effect HttpClient
- [x] Wrap `providers/bitbucket/resolve-repo.ts` with Effect HttpClient
- [x] Wrap `providers/azurerepos/repo-exists.ts` with Effect HttpClient
- [x] Remove all TODO #52 comments

### 2.2 Add unit tests for each provider

- [x] Add `providers/github/resolve-repo.test.ts` (mock HttpClient layer)
- [x] Add `providers/gitlab/resolve-repo.test.ts`
- [x] Add `providers/bitbucket/resolve-repo.test.ts`
- [x] Add `providers/azurerepos/repo-exists.test.ts`

### 2.3 Wire HttpClient layer

- [x] Ensure HttpClient service is provided in the CLI runtime layer (already wired via FetchHttpClient.layer in runtime.ts)
- [x] Verify all provider tests pass
- [ ] Verify E2E tests pass

---

## Phase 3: Replace `unzip` CLI with JS Zip Library (TODO #24, #43)

`packages/core/src/unstable/registry/utils.ts` uses `node:child_process` (`execFileSync`/`execSync`) to call `unzip`. Replace with a JS zip library for portability and convention compliance. Single PR.

- [x] Choose zip library (fflate or yauzl) and add to core dependencies — chose fflate
- [x] Rewrite `extractZip` in `registry/utils.ts` using the JS library
- [x] Remove `node:child_process` import
- [x] Remove TODO #24, #43 comments
- [x] Verify registry download and extraction tests pass
- [ ] Verify E2E install tests pass (registry installs exercise this path)
- [ ] Verify extraction works on macOS and Linux (the two CI platforms) — this is the primary portability motivation

---

## Phase 4: Migrate Legacy Plan System

The largest cleanup. The deprecated operation-based plan model (`Operation`, `OperationResult`, `OperationHandler`, `LegacyPlan`, `bridgeLegacyPlan`) is used by every command handler. Migrate to the new readiness-based model with inline run closures.

**PR strategy:** One PR per sub-phase (4.1–4.7). Each PR must pass CI before merging. Sub-phases are ordered by dependency — operations before CLI handlers (handlers depend on operations), shared modules after all consumers are migrated, deletion last.

**Dependency order:** 4.1 → 4.2 → 4.3 → 4.4 → (4.5 can parallel 4.1–4.4) → 4.6 (after all consumers migrated) → 4.7 (deletion, last).

### 4.1 Skills operations (PR 1)

- [x] Migrate `skills/operations/install.ts` — replace `OperationResult` with `JobStepResult`
- [x] Migrate `skills/operations/uninstall.ts`
- [x] Migrate `skills/operations/enable.ts`
- [x] Migrate `skills/operations/disable.ts`
- [x] Migrate `skills/operations/rename.ts`
- [x] Migrate `skills/operations/copy.ts`
- [x] Migrate `skills/operations/new-skill.ts`
- [x] Migrate `skills/operations/publish.ts`
- [x] Update all corresponding tests
- [x] CI green

### 4.2 Skills CLI handlers (PR 2, depends on 4.1)

- [x] Migrate `cli/src/root/skills/rename.ts` — build Plan directly instead of LegacyPlan + bridgeLegacyPlan
- [x] Migrate `cli/src/root/skills/new.ts`
- [x] Migrate `cli/src/root/skills/enable.ts`
- [x] Migrate `cli/src/root/skills/disable.ts`
- [x] Migrate `cli/src/root/skills/publish.ts`
- [x] Migrate `cli/src/root/skills/update/handler.ts` and `plan.ts`
- [x] Migrate `cli/src/root/skills/plan-helpers.ts` — marked deprecated, consumers migrated
- [x] Update all corresponding tests
- [x] CI green

### 4.3 Packs operations (PR 3)

- [x] Migrate `packs/operations/install.ts`
- [x] Migrate `packs/operations/uninstall.ts`
- [x] Migrate `packs/operations/unpack.ts`
- [x] Migrate `packs/operations/add-to-pack.ts`
- [x] Migrate `packs/operations/remove-from-pack.ts`
- [x] Migrate `packs/operations/new-pack.ts`
- [x] Migrate `packs/operations/publish.ts`
- [x] Update all corresponding tests
- [x] CI green

### 4.4 Packs CLI handlers (PR 4, depends on 4.3)

- [x] Migrate `cli/src/root/packs/add.ts`
- [x] Migrate `cli/src/root/packs/remove.ts`
- [x] Migrate `cli/src/root/packs/new.ts`
- [x] Migrate `cli/src/root/packs/publish.ts`
- [x] Migrate `cli/src/root/packs/unpack/handler.ts` and `plan.ts`
- [x] Update all corresponding tests
- [x] CI green

### 4.5 Commands & MCP Servers operations (PR 5, independent of 4.1–4.4)

- [x] Migrate `commands/operations/install.ts`
- [x] Migrate `commands/operations/uninstall.ts`
- [x] Migrate `commands/operations/publish.ts`
- [x] Migrate `mcp-servers/operations/install.ts`
- [x] Migrate `mcp-servers/operations/uninstall.ts`
- [x] Migrate `mcp-servers/operations/publish.ts`
- [x] Update all corresponding tests
- [x] CI green

### 4.6 Shared workspace modules (PR 6, after 4.1–4.5 merged)

- [x] Migrate `workspace/reconciliation.ts` — replace `OperationResult` returns with `JobStepResult`
- [x] Update `workspace/reconciliation.test.ts`
- [x] Migrate `workspace/augment-plan.ts` — remove `OperationResult` dependency and `toJobStepResult` converter
- [x] Migrate `workspace/apply-plan.ts` — update `OperationHandler` to use `JobStepResult`
- [x] Update `workspace/apply-plan.test.ts`
- [x] CI green

### 4.7 Delete legacy plan infrastructure (PR 7, after 4.6 merged)

Only after all handlers and shared modules are migrated:

- [x] Delete `workspace/plan-bridge.ts`
- [x] Remove `OperationResult` type from `workspace/plan.ts` (kept `Operation` — still used by handlers)
- [x] Remove legacy exports from `workspace/index.ts`
- [x] Delete `cli/src/root/skills/plan-helpers.ts` and `plan-helpers.test.ts`
- [x] Verify full test suite passes
- [ ] Verify E2E tests pass
