## Why

The install handler performs skill discovery and selection _before_ calling `buildIdealForInstall`, but then passes only skill **names** in `InstallCommand` and re-performs parsing and discovery inside `buildIdealForInstall` via `BuildIdealDeps` callbacks. This indirection adds complexity without value.

More broadly, the command types (`InstallCommand`, `UninstallCommand`, `UpdateCommand`) are batch-oriented and each requires its own builder function with different dep interfaces. A per-skill operation model is simpler.

Additionally, two separate source types exist (`Source` and `SkillSourceV2`) representing the same concept — where a skill comes from. The conversion between them is lossy (gitlab/bitbucket collapse to Local) and unnecessary. One type should be used everywhere.

## What Changes

- **BREAKING** Unify `Source` and `SkillSourceV2` into a single `Source` type used from parsing through to lockfile/settings persistence
- **BREAKING** Replace `InstallCommand`, `UninstallCommand`, `UpdateCommand` with `WorkspaceOperation` union: `AddSkillOperation | RemoveSkillOperation`
- **BREAKING** Replace `buildIdealForInstall`/`buildIdealForUninstall` with `buildIdealState(currentState, operations)`
- **BREAKING** Remove `BuildIdealDeps`, `BuildIdealUpdateDeps`, `BuildIdealStateDeps`
- Remove `createBuildIdealDeps` and `sourceToV2` from the install handler
- Update lockfile/settings serialization to handle all source variants (no more collapsing)

## Capabilities

### New Capabilities

_(none — this is a simplification, not new functionality)_

### Modified Capabilities

- `cli-skills-install`: Command types replaced with per-skill operations. Source types unified. `buildIdealState` takes `(currentState, operations[])`.

## Impact

- `packages/cli/src/extensions/skills/state/types.ts` — remove `SkillSourceV2`; types reference `Source` from `sources/types.ts`
- `packages/cli/src/workspace/ideal-state.ts` — replace command types + builders with `WorkspaceOperation` + fold-based `buildIdealState`
- `packages/cli/src/workspace/ideal-state.test.ts` — rewrite tests for operation-based API
- `packages/cli/src/workspace/apply.ts` — update `sourceV2ToLockEntry` and `sourceV2ToSettingsValue` to work with `Source`
- `packages/cli/src/workspace/load-state.ts` — update `parseSourceFromEntry` to return `Source`
- `packages/cli/src/workspace/index.ts` — barrel exports
- `packages/cli/src/cli-commands/skills/install/handler.ts` — remove `createBuildIdealDeps`, `sourceToV2`; use `Source` directly
- `packages/cli/src/cli-commands/skills/uninstall/handler.ts` — build `RemoveSkillOperation[]`
- `packages/cli/src/cli-commands/skills/display.ts` — remove `formatSourceV2`, use `printSource`
