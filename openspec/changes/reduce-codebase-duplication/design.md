## Context

The codebase has accumulated dead code from prior refactors (gutted resolution module, unused git operations, unused workspace function), unused exports across several modules, and two skipped handler test suites. This change removes all dead/unused code and addresses the skipped tests.

A thorough SRP analysis confirmed that most apparent duplication (source providers, yargs options, test infrastructure) represents correct feature boundaries and should not be consolidated. The only consolidation is extracting a single-step plan builder within the skills feature.

## Goals / Non-Goals

**Goals:**

- Remove all dead modules, unused exports, and orphan files
- Address skipped test suites (fix or remove with justification)
- Extract single-step plan builder within skills feature
- Clean up stale TODO comments with improved error messages
- All changes pass lint and type checks

**Non-Goals:**

- Consolidating source provider implementations (SRP violation)
- Extracting shared yargs option builders (commands own their CLI contracts)
- Shared test infrastructure (co-location principle; subtle per-handler variations)
- Shared agent symlink iteration helpers (different error handling/state per operation)
- Any behavioral changes to user-facing functionality

## Decisions

### 1. Delete entire resolution/ directory

**Decision**: Remove `resolution/resolver.ts`, `resolution/index.ts`, and relocate `resolution/resolution-flow.test.ts` to `sources/resolution-flow.test.ts`.

**Rationale**: The module is fully gutted — `resolver.ts` is a comment-only file, `index.ts` exports `{}`, and neither is imported. The test file tests `sources/` functionality (resolveSource + SourceHostProviders.find), not the dead module. Moving it to `sources/` reflects its actual imports.

**Alternative considered**: Keep the directory as documentation of the migration. Rejected — the test file's header comment already documents the migration, and git history preserves the old code.

### 2. Remove unused functions, don't deprecate

**Decision**: Delete unused exports outright rather than marking them deprecated.

**Rationale**: These functions have zero production callers. No external consumers exist (this is a CLI tool, not a library). Backward compatibility is a non-goal per project rules. Git history preserves them if needed later.

**Functions to remove**:

- `git/operations.ts`: `cloneRepo`, `getCurrentCommit`, `isGitRepository`, `resolveRef`
- `sources/utils.ts`: `isGitHostingProviderSource`
- `sources/github/api.ts`: `fetchGitHubTreeHash`
- `settings/format-preserving-json.ts`: `modifyJsonFile`, `ensureTopLevelProperty`, `detectFormatting`
- `runtime/error-handling.ts`: `ErrorClassification` (type export)
- `workspace/ensure-agents.ts`: `ensureAgentsConfigured`, `EnsureAgentsOptions` (entire file + test)

### 3. Handle associated test files

**Decision**: When removing an unused function that has a dedicated test file, remove the test file too. When removing an export that's tested inline in a shared test file, remove only the relevant test cases.

**Specifics**:

- `workspace/ensure-agents.test.ts` — delete entirely (tests the unused function)
- `sources/github/api.test.ts` — remove `fetchGitHubTreeHash` tests, keep `getTreeSha` tests
- `settings/format-preserving-json.test.ts` — remove tests for the 3 unused exports, keep any tests for used functions in the same file
- `git/operations.ts` tests — remove tests for the 4 unused functions, keep tests for `getTreeSha` and `shallowClone`

### 4. Skipped test suites — investigate before deciding

**Decision**: Read the skipped tests to understand why they're skipped, then either fix or remove with documented rationale. Do not blindly re-enable.

**Approach**: The `describe.skip` in `skills/install/handler.test.ts` and `skills/update/handler.test.ts` may be due to recent handler refactors that changed signatures. Check if the tests can be updated to match current handler APIs, or if they're superseded by other test coverage.

### 5. Single-step plan builder placement

**Decision**: Extract to `cli-commands/skills/plan-helpers.ts`, not to a shared `utils/` location.

**Rationale**: Enable, disable, and rename are all skills operations. The helper belongs in the skills feature, respecting "group by feature." If packs later need a similar helper, they create their own — no cross-feature coupling.

### 6. Order of operations

**Decision**: Work in dependency order to keep the build green at each step:

1. Remove dead modules (resolution/) — no dependents
2. Remove unused exports — verify barrel files still valid
3. Update barrel files (index.ts) to remove re-exports of deleted items
4. Relocate resolution-flow.test.ts
5. Address skipped test suites
6. Extract single-step plan builder
7. Clean up TODO comments in resolve-skill-install-source.ts

## Risks / Trade-offs

**[Risk] Removing "unused" functions that are actually used dynamically** → Mitigation: Grep verified zero import sites for each function. No dynamic imports or string-based references exist in this codebase.

**[Risk] Skipped tests might reveal bugs when re-enabled** → Mitigation: This is a feature, not a risk. If the tests fail, we fix the code or update the tests — either way the codebase improves.

**[Risk] Relocating resolution-flow.test.ts changes import paths** → Mitigation: The test already imports from `../sources/` via relative paths. Moving to `sources/` simplifies these to `./` — strictly simpler.
