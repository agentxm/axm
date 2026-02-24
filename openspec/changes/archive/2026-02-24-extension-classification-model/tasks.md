> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Settings Taxonomy Foundation

> **Subagent:** Run this entire phase in a single subagent.

Depends on: None (start here)

- [x] 1.1 Add/red tests for settings schema changes: remove `managed: false` skill entries, add `ignored.{skills,commands,mcpServers,packs}`, validate trim/dedupe/invalid ignored patterns, validate configured-vs-ignored conflicts
- [x] 1.2 Implement settings schema updates (`SkillEntrySchema`, ignored maps, `mcpServers` naming alignment) and wire error codes `SETTINGS_IGNORED_PATTERN_INVALID` and `SETTINGS_IGNORED_CONFIG_CONFLICT`
- [x] 1.3 Run `pnpm typecheck` immediately after task 1.2 and fix any errors
- [x] 1.4 Implement ignored-pattern normalization helpers following the existing normalize/collapse settings pattern
- [x] 1.5 Run `pnpm typecheck` immediately after task 1.4 and fix any errors
- [x] 1.6 Update settings key ordering/read-write paths for new fields and key names
- [x] 1.7 Run `pnpm typecheck` immediately after task 1.6 and fix any errors
- [x] 1.8 Run `pnpm typecheck` and fix any errors
- [x] 1.9 Run `pnpm lint` and fix any errors
- [x] 1.10 Run `pnpm test` and fix any failures
- [x] 1.11 Run `pnpm test:e2e` and fix any failures
- [x] 1.12 Kill any vitest worker processes
- [x] 1.13 Acceptance criteria: settings parsing rejects `{ managed: false }` skill entries and the failure is covered by tests
- [x] 1.14 Acceptance criteria: ignored patterns are trimmed/deduped and invalid empty patterns are rejected with `SETTINGS_IGNORED_PATTERN_INVALID`
- [x] 1.15 Acceptance criteria: configured entries matching ignored patterns fail with `SETTINGS_IGNORED_CONFIG_CONFLICT`

## 2. Shared Classifier Core

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [x] 2.1 Add/red unit tests for classifier invariants and lifecycle sets across all `ExtensionType` values (`configured`, `implicit`, `unmanaged`, `installed`, disjointness, deterministic ordering)
- [x] 2.2 Implement shared workspace classifier module with taxonomy lifecycle derivation and typed failure `WORKSPACE_CLASSIFIER_NON_NATIVE_LOCKFILE_ONLY`
- [x] 2.3 Run `pnpm typecheck` immediately after task 2.2 and fix any errors
- [x] 2.4 Implement source metadata derivation (`packagingKind`, `isBuiltIn`), `pack` native-only enforcement, and derived external views
- [x] 2.5 Run `pnpm typecheck` immediately after task 2.4 and fix any errors
- [x] 2.6 Reuse shared glob helper semantics (`skills/glob.ts`) for ignored matching in classifier paths
- [x] 2.7 Run `pnpm typecheck` immediately after task 2.6 and fix any errors
- [x] 2.8 Run `pnpm typecheck` and fix any errors
- [x] 2.9 Run `pnpm lint` and fix any errors
- [x] 2.10 Run `pnpm test` and fix any failures
- [x] 2.11 Run `pnpm test:e2e` and fix any failures
- [x] 2.12 Kill any vitest worker processes
- [x] 2.13 Acceptance criteria: classifier output is deterministic and name-sorted for repeated runs with identical input
- [x] 2.14 Acceptance criteria: lifecycle invariants hold (`C ∩ P = ∅`, `U ∩ Installed = ∅`, `E = C ⊎ P ⊎ U`) across all `ExtensionType` variants
- [x] 2.15 Acceptance criteria: invalid lockfile-only non-native input fails with `WORKSPACE_CLASSIFIER_NON_NATIVE_LOCKFILE_ONLY`

## 3. Workspace Service API Migration

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2

- [x] 3.1 Add/red workspace service tests for new getter contracts (`configured/implicit/unmanaged/installed/classified/ignored/external`) for skills, commands, mcp servers, and packs
- [x] 3.2 Implement workspace service integration with the classifier and add new getters per design contract
- [x] 3.3 Run `pnpm typecheck` immediately after task 3.2 and fix any errors
- [x] 3.4 Update existing workspace methods (`getConfiguredSkills`, `getInstalledSkills`, `setSkillEntry`, `updateSkillEntry`, `getConfiguredCommands`, `getConfiguredMcpServers`, `getConfiguredPacks`, `getInstalledPacks`) to taxonomy-consistent shapes/semantics
- [x] 3.5 Run `pnpm typecheck` immediately after task 3.4 and fix any errors
- [x] 3.6 Implement non-skill phase-1 behavior (empty unmanaged sets) and adapter mapping to settings/lockfile keys
- [x] 3.7 Run `pnpm typecheck` immediately after task 3.6 and fix any errors
- [x] 3.8 Run `pnpm typecheck` and fix any errors
- [x] 3.9 Run `pnpm lint` and fix any errors
- [x] 3.10 Run `pnpm test` and fix any failures
- [x] 3.11 Run `pnpm test:e2e` and fix any failures
- [x] 3.12 Kill any vitest worker processes
- [x] 3.13 Acceptance criteria: `getConfiguredSkills` and `getInstalledSkills` return taxonomy-consistent shapes and no `managed` marker field
- [x] 3.14 Acceptance criteria: `getInstalledPacks` includes lockfile-only implicit packs (including built-in lockfile entries)
- [x] 3.15 Acceptance criteria: MCP settings APIs use `mcpServers` (camelCase) consistently for read/write paths

## 4. Command And Source Behavior Migration

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.2, 4.4, and 4.6 are independent — launch as parallel subagents.

Depends on: Phase 3

- [x] 4.1 Add/red tests for modified command/source capabilities: `cli-skills-enable-disable`, `cli-skills-rename`, `cli-skills-uninstall`, `cli-skills-fork`, `skills-fork`, `cli-skills-publish-glob`, `cli-skills-update`, `resolve-source`, `source-aware-glob`
- [x] 4.2 Implement enable/disable/rename/uninstall lifecycle validation updates (remove marker-based unmanaged paths, enforce configured/installed semantics, honor ignored exclusion)
- [x] 4.3 Run `pnpm typecheck` immediately after task 4.2 and fix any errors
- [x] 4.4 Implement fork/publish/update behavior updates (taxonomy candidate sets, installed-only publish globs, configured-only update iteration, no unmanaged-marker logs)
- [x] 4.5 Run `pnpm typecheck` immediately after task 4.4 and fix any errors
- [x] 4.6 Implement `resolve-source` and `resolve-source-pattern` updates (`source: string` configured semantics, taxonomy candidate discovery, ignored exclusions)
- [x] 4.7 Run `pnpm typecheck` immediately after task 4.6 and fix any errors
- [x] 4.8 Run `pnpm typecheck` and fix any errors
- [x] 4.9 Run `pnpm lint` and fix any errors
- [x] 4.10 Run `pnpm test` and fix any failures
- [x] 4.11 Run `pnpm test:e2e` and fix any failures
- [x] 4.12 Kill any vitest worker processes
- [x] 4.13 Acceptance criteria: enable/disable/rename/uninstall paths no longer depend on marker-based unmanaged checks
- [x] 4.14 Acceptance criteria: `resolve-source` and `resolve-source-pattern` use configured skill `source: string` semantics without `Option` fallback assumptions
- [x] 4.15 Acceptance criteria: fork and publish glob expansions use taxonomy-derived candidates and exclude ignored names

## 5. Fixture And Test Suite Cleanup

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4

- [x] 5.1 Add/red regression tests for ignored-pattern behavior (`openspec-*` style), non-native lockfile-only classifier failure, and pack native-only invariant
- [x] 5.2 Migrate fixtures/test data from legacy unmanaged markers to taxonomy + ignored-pattern inputs
- [x] 5.3 Run `pnpm typecheck` immediately after task 5.2 and fix any errors
- [x] 5.4 Update test doubles/mocks for new workspace service method inventory and return payload shapes
- [x] 5.5 Run `pnpm typecheck` immediately after task 5.4 and fix any errors
- [x] 5.6 Reuse and extend `skills/glob.test.ts` coverage for ignored-pattern wildcard semantics to avoid duplicate matcher behavior
- [x] 5.7 Run `pnpm typecheck` immediately after task 5.6 and fix any errors
- [x] 5.8 Run `pnpm typecheck` and fix any errors
- [x] 5.9 Run `pnpm lint` and fix any errors
- [x] 5.10 Run `pnpm test` and fix any failures
- [x] 5.11 Run `pnpm test:e2e` and fix any failures
- [x] 5.12 Kill any vitest worker processes
- [x] 5.13 Acceptance criteria: legacy unmanaged-marker fixtures/assertions are removed or migrated to taxonomy + ignored behavior
- [x] 5.14 Acceptance criteria: ignored-pattern wildcard behavior is covered by shared `skills/glob` tests (no parallel matcher test suites)
- [x] 5.15 Acceptance criteria: regressions cover ignored exclusions, pack native-only invariant, and classifier non-native lockfile-only failure

## 6. Final Verification And Apply Readiness

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 5

- [x] 6.1 Run `openspec validate extension-classification-model --json` and fix any reported issues
- [x] 6.2 Run `openspec status --change extension-classification-model --json` and confirm all artifacts are complete
- [x] 6.3 Run `pnpm typecheck` and fix any errors
- [x] 6.4 Run `pnpm lint` and fix any errors
- [x] 6.5 Run `pnpm test` and fix any failures
- [x] 6.6 Run `pnpm test:e2e` and fix any failures
- [x] 6.7 Kill any vitest worker processes
- [x] 6.8 Acceptance criteria: `openspec validate extension-classification-model --json` reports zero issues
- [x] 6.9 Acceptance criteria: `openspec status --change extension-classification-model --json` reports all artifacts as done and `isComplete: true`
- [x] 6.10 Acceptance criteria: final verification commands complete cleanly with no lingering vitest worker processes
