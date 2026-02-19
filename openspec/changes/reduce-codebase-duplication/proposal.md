## Why

The codebase has accumulated dead code, unused exports, and skipped test suites that add noise and maintenance burden. The old resolution module is fully gutted but still present, several exported functions across git/, sources/, settings/, and workspace/ are never called in production, and two critical handler test suites are entirely skipped. Cleaning these up reduces cognitive load, shrinks the codebase, and ensures tests reflect actual behavior.

A separate SRP analysis evaluated broader consolidation opportunities (source provider factories, shared yargs builders, test infrastructure extraction, handler helpers) and found that in most cases the current duplication represents **correct feature boundaries** — each provider/command/test owns its full responsibility and can evolve independently. Shallow duplication (~20-40 lines) across self-contained feature modules is preferable to shared abstractions that would couple unrelated features.

## What Changes

### Dead code removal

- **BREAKING** Remove `resolution/resolver.ts` — empty stub documenting a removed function, not imported anywhere
- **BREAKING** Remove `resolution/index.ts` — exports empty object `{}`, not imported anywhere
- Move `resolution/resolution-flow.test.ts` to `sources/` — it tests `resolveSource()` and `SourceHostProviders.find()`, not the dead resolution module
- Remove `workspace/ensure-agents.ts` and `workspace/ensure-agents.test.ts` — function is exported but never called from any production code

### Unused export cleanup

- Remove 4 unused exports from `git/operations.ts`: `cloneRepo`, `getCurrentCommit`, `isGitRepository`, `resolveRef` — none are imported in production code (only `getTreeSha` and `shallowClone` are used)
- Remove unused `isGitHostingProviderSource` from `sources/utils.ts` — never imported anywhere
- Remove unused `fetchGitHubTreeHash` export from `sources/github/api.ts` — only referenced by its own test file, not production code
- Remove 3 unused exports from `settings/format-preserving-json.ts`: `modifyJsonFile`, `ensureTopLevelProperty`, `detectFormatting` — exported via barrel but never imported by production code
- Remove unused `ErrorClassification` export from `runtime/error-handling.ts` — only used internally as return type, never imported elsewhere

### Skipped test suites

- Address `skills/install/handler.test.ts` — entire handler suite wrapped in `describe.skip`
- Address `skills/update/handler.test.ts` — entire handler suite wrapped in `describe.skip`
- Either fix and re-enable, or remove if superseded by other tests

### Minor cleanup

- Clean up 5 identical TODO comments in `skills/install/resolve-skill-install-source.ts` ("update and make error more accurate/meaningful") by improving the error messages
- Extract single-step plan builder to `cli-commands/skills/single-step-plan.ts` — the only consolidation that respects SRP, since enable/disable/rename are all skills-feature operations with identical plan construction (lives within the feature, not in shared utils)

### Consolidations evaluated and rejected (SRP violations)

The following were analyzed and intentionally **not** included:

- **Source provider factories** (print, scp, shorthand, resolve-repo) — each provider owns its complete parsing surface; a factory would become a multi-concern module coupling providers that should evolve independently; shared logic is already properly factored in `parse-provider-shorthand.ts`
- **Shared yargs option builders** — options diverge semantically across commands; each command owns its CLI contract
- **Agent symlink iteration helper** — enable/disable/uninstall have different error handling, state updates, and fallback strategies
- **Pack manifest I/O helpers** — trivial I/O masking fundamentally different domain logic (add resolves extensions, remove trims sections)
- **Test infrastructure** (makeLayers, initWorkspace, fixtures) — subtle per-handler variations; co-location principle says helpers live near their tests; shared TUI layer factories already exist at the right level

## Capabilities

### New Capabilities

_None — this change removes dead code and unused exports, it does not introduce new capabilities._

### Modified Capabilities

_None — existing spec-level behavior is unchanged._

## Impact

- **Resolution module** (`resolution/`): Directory removed entirely; test file relocated to `sources/`
- **Git module** (`git/operations.ts`): 4 unused functions removed
- **Workspace module** (`workspace/ensure-agents.ts` + test): Removed entirely
- **Settings module** (`settings/format-preserving-json.ts`): 3 unused exports removed
- **Sources module** (`sources/utils.ts`, `sources/github/api.ts`): Unused exports removed
- **Runtime module** (`runtime/error-handling.ts`): Unused type export removed
- **Skills handlers**: 2 skipped test suites addressed; single-step plan builder extracted within feature
- **Skills install**: TODO error messages cleaned up
- **Estimated net reduction**: ~300-500 lines of dead/unused code eliminated
- **No behavioral changes** to any user-facing functionality
