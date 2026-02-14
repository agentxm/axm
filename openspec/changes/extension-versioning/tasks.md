> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Foundation — semver dependency and version constraint module

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Install `semver` and `@types/semver` as dependencies in `packages/cli`
- [ ] 1.2 Write tests for version constraint utilities: `parseVersionConstraint` (extracts constraint from source string suffix), `isValidConstraint` (validates via `semver.validRange`), `satisfiesConstraint` (wraps `semver.satisfies`), and `resolveVersionWithConstraint` (iterate versions newest-first, return first satisfying constraint + agent filter)
- [ ] 1.3 Implement `packages/cli/src/version-constraints/version-constraints.ts` with the utilities above, wrapping semver calls with Effect conventions (CliError for invalid range, Option for no-match)
- [ ] 1.4 Implement `packages/cli/src/version-constraints/index.ts` barrel export
- [ ] 1.5 Verify typecheck passes (`pnpm typecheck`), fix any errors
- [ ] 1.6 Verify linting passes (`pnpm lint`), fix any errors
- [ ] 1.7 Verify all tests pass (`pnpm test`), fix any failures
- [ ] 1.8 Kill any vitest worker processes

## 2. Source parsing — extract version constraint from source strings

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

- [ ] 2.1 Write tests for updated source parsing: `@scope/name@^1.0.0` extracts `versionConstraint: Option.some("^1.0.0")`, `@scope/name` yields `Option.none()`, `@scope/name@1.2.3` extracts exact pin, `@scope/name@~1.2.0` extracts tilde, `@scope/name@not-a-version` extracts raw string (validation happens downstream)
- [ ] 2.2 Add `versionConstraint: Option<string>` field to `RegistrySourceInput` in `packages/cli/src/sources/types.ts`
- [ ] 2.3 Update `parseInputPattern()` in `packages/cli/src/sources/parser.ts` to split the name portion on `@` (after scope) and extract the version suffix into the new field
- [ ] 2.4 Update `printSourceInput()` and `lockEntryToSourceInput()` to round-trip the version constraint (append `@constraint` when present)
- [ ] 2.5 Thread `versionConstraint` through `resolveSource()` in `packages/cli/src/sources/resolve-source.ts` so it reaches the registry provider
- [ ] 2.6 Verify typecheck passes (`pnpm typecheck`), fix any errors
- [ ] 2.7 Verify linting passes (`pnpm lint`), fix any errors
- [ ] 2.8 Verify all tests pass (`pnpm test`), fix any failures
- [ ] 2.9 Verify E2E tests pass (`pnpm test:e2e`), fix any failures
- [ ] 2.10 Kill any vitest worker processes

## 3. Registry resolution — constraint-aware version selection

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1, Phase 2.

- [ ] 3.1 Write tests for updated `selectVersion` in `packages/cli/src/sources/providers/registry.ts`: version constraint passed in → filter via `semver.satisfies()` in addition to agent filter; no constraint → pick newest (existing behavior); no satisfying version → return `Option.none()`; invalid constraint → fail with CliError
- [ ] 3.2 Update `selectVersion` to accept an optional version constraint parameter and filter using `satisfiesConstraint` from the version-constraints module
- [ ] 3.3 Update callers of `selectVersion` (registry provider discovery flow) to pass the version constraint from the resolved source
- [ ] 3.4 Verify typecheck passes (`pnpm typecheck`), fix any errors
- [ ] 3.5 Verify linting passes (`pnpm lint`), fix any errors
- [ ] 3.6 Verify all tests pass (`pnpm test`), fix any failures
- [ ] 3.7 Verify E2E tests pass (`pnpm test:e2e`), fix any failures
- [ ] 3.8 Kill any vitest worker processes

## 4. Skill install — persist version constraint in settings

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2, Phase 3.

- [ ] 4.1 Write tests for install handler: `axm install @acme/tool` writes `"@acme/tool"` to settings, `axm install @acme/tool@^1.0.0` writes `"@acme/tool@^1.0.0"` to settings, `axm install @acme/tool@1.2.3` writes `"@acme/tool@1.2.3"` to settings
- [ ] 4.2 Update `lockEntryToSourceInput()` and `printSourceInput()` (if not already done in Phase 2) to preserve the version constraint when generating the settings source string in `ws.setSkill()`
- [ ] 4.3 Verify the round-trip: source string with version → parse → resolve → lock → settings entry preserves the version constraint
- [ ] 4.4 Verify typecheck passes (`pnpm typecheck`), fix any errors
- [ ] 4.5 Verify linting passes (`pnpm lint`), fix any errors
- [ ] 4.6 Verify all tests pass (`pnpm test`), fix any failures
- [ ] 4.7 Verify E2E tests pass (`pnpm test:e2e`), fix any failures
- [ ] 4.8 Kill any vitest worker processes

## 5. Pack install — exclude pack deps from settings, apply manifest constraints

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2, Phase 3.

- [ ] 5.1 Write tests for updated pack install handler: pack skill dependencies are written to lockfile but NOT to settings; pack manifest version constraints are used when resolving skill dependencies (e.g., `"^1.0.0"` selects newest matching); pack with `"*"` resolves to latest; pack version constraint from source string persisted in settings
- [ ] 5.2 Add a mechanism to the skill install path that skips writing to settings when installing pack dependencies (e.g., a `skipSettings` flag on the install operation or a separate code path)
- [ ] 5.3 Update the pack install handler to pass version constraints from the pack manifest when resolving/fetching each skill dependency
- [ ] 5.4 Update the pack install handler to persist the pack's own version constraint from the source string into settings (e.g., `@acme/pack@^2.0.0`)
- [ ] 5.5 Verify typecheck passes (`pnpm typecheck`), fix any errors
- [ ] 5.6 Verify linting passes (`pnpm lint`), fix any errors
- [ ] 5.7 Verify all tests pass (`pnpm test`), fix any failures
- [ ] 5.8 Verify E2E tests pass (`pnpm test:e2e`), fix any failures
- [ ] 5.9 Kill any vitest worker processes

## 6. Pack add — default to `*` and support inline version syntax

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1.

> **Parallelization:** Tasks 6.1 and 6.2 are independent — can be developed in parallel within the subagent.

- [ ] 6.1 Write tests for updated `axm packs add`: `axm packs add pack @acme/tool` writes `"*"` to manifest (not `"^resolved"`); `axm packs add pack @acme/tool@^1.0.0` writes `"^1.0.0"`; `axm packs add pack @acme/tool@1.2.3` writes `"1.2.3"`
- [ ] 6.2 Update `toVersionRange()` in `packages/cli/src/cli-commands/packs/add/handler.ts` — default to `"*"` when no version specified in the source string; use the parsed version constraint when present
- [ ] 6.3 Verify typecheck passes (`pnpm typecheck`), fix any errors
- [ ] 6.4 Verify linting passes (`pnpm lint`), fix any errors
- [ ] 6.5 Verify all tests pass (`pnpm test`), fix any failures
- [ ] 6.6 Verify E2E tests pass (`pnpm test:e2e`), fix any failures
- [ ] 6.7 Kill any vitest worker processes

## 7. Skills update — constraint-aware resolution, pack updates, cascade

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2, Phase 3, Phase 5.

- [ ] 7.1 Write tests for constraint collection: handler reads version constraint from settings source string; handler reads pack manifest constraints from installed pack manifests on disk; user explicit constraint (not `*`) wins over pack constraint; pack constraints apply when user has `*`
- [ ] 7.2 Write tests for multi-constraint resolution: compatible pack constraints intersected (newest satisfying all); incompatible pack constraints use newest with warning; user constraint unsatisfiable fails with CliError
- [ ] 7.3 Write tests for update warnings: warn when pack holds back user's latest-intent skill; no warning for pack-only skills; no warning for user explicit constraint
- [ ] 7.4 Write tests for pack update: packs re-resolved within their constraint; pack update cascades — new deps installed, removed deps orphan-checked, changed constraints re-resolved; pack deps re-resolved even when pack version unchanged
- [ ] 7.5 Implement constraint collection logic in the update handler: extract version constraint from settings source string, read pack manifests from disk to collect pack constraints per skill
- [ ] 7.6 Implement constraint priority resolution: user explicit constraint → resolve with user constraint only (hard fail if unsatisfiable); user `*` → iterate versions against all pack constraints, fallback to newest with warning if incompatible
- [ ] 7.7 Implement update warning logic: detect when pack constraint holds back a user-installed `*` skill and emit warning
- [ ] 7.8 Implement pack update flow in the update handler: re-resolve pack versions within constraints, compare manifests on version change (new deps, removed deps, changed constraints), run orphan detection on removed deps, re-resolve pack deps even when pack version is unchanged
- [ ] 7.9 Verify typecheck passes (`pnpm typecheck`), fix any errors
- [ ] 7.10 Verify linting passes (`pnpm lint`), fix any errors
- [ ] 7.11 Verify all tests pass (`pnpm test`), fix any failures
- [ ] 7.12 Verify E2E tests pass (`pnpm test:e2e`), fix any failures
- [ ] 7.13 Kill any vitest worker processes

## 8. Skills uninstall — ownership-aware removal

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5 (derived ownership model in place).

- [ ] 8.1 Write tests for ownership-aware uninstall: skill not referenced by any pack → removed from settings, lockfile, and disk; skill referenced by a pack's `resolvedSkills` → removed from settings but kept in lockfile and on disk; skill referenced by multiple packs → removed from settings but kept
- [ ] 8.2 Implement ownership derivation utility: given a skill FQN, scan all pack lock entries' `resolvedSkills` to determine if any pack references it
- [ ] 8.3 Update the skills uninstall handler to check pack references before building uninstall operations — if pack still references the skill, build a "remove from settings only" operation instead of full uninstall
- [ ] 8.4 Verify typecheck passes (`pnpm typecheck`), fix any errors
- [ ] 8.5 Verify linting passes (`pnpm lint`), fix any errors
- [ ] 8.6 Verify all tests pass (`pnpm test`), fix any failures
- [ ] 8.7 Verify E2E tests pass (`pnpm test:e2e`), fix any failures
- [ ] 8.8 Kill any vitest worker processes

## 9. Integration verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: All previous phases.

- [ ] 9.1 Run full typecheck (`pnpm typecheck`), fix any errors
- [ ] 9.2 Run full lint (`pnpm lint`), fix any errors
- [ ] 9.3 Run full test suite (`pnpm test`), fix any failures
- [ ] 9.4 Run full E2E test suite (`pnpm test:e2e`), fix any failures
- [ ] 9.5 Kill any vitest worker processes
