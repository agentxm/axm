## Why

The codebase has drifted from CLAUDE.md conventions over time. Key Effect patterns (Option<T>, Array.Array, Record.Record), TypeScript conventions (no type re-exports), and error handling patterns (no throwing in helpers, Schema validation) are not consistently followed. This audit aligns the codebase with current guidance.

## What Changes

### High Priority

- **Convert optional properties to Option<T>** across type definitions in extensions, resolution, clack-effect, workspace, agents, lockfile, settings, and handler modules (~80 instances including `| undefined` patterns across 17 files)
- **Convert `T[]` to `Array.Array<T>`** across type definitions and schemas (~60 instances of `readonly string[]`, `T[]` across 12 files)
- **Convert `Record<K,V>` to `Record.Record<K,V>`** in type definitions (~10 instances across 5 files)
- **Remove type re-exports** from barrel files—imports must come from the owning module:
  - `extensions/skills/index.ts` re-exports 21 items from lockfile + settings
  - `workspace/index.ts` re-exports 24+ items from lockfile + settings + state/types
  - `cli-commands/skills/display.ts` re-exports 3 items from workspace
  - Consumer files must be updated to import from owning modules
- **Convert throwing helper to Effect** in `workspace/apply.ts` (`getSourcePath` function)
- **Add Schema validation** for `YAML.parse` in `workspace/load-state.ts` (currently uses type assertions without validation)
- **Replace Promise .catch() with Effect error handling** in `main.ts:38-41`
- **Add Schema validation for Settings type assertions** in `workspace/service.ts:170,280`

### Lower Priority

- **Wrap test utilities with Effect** (e2e/utils.ts uses async/await)
- **Review mutable Map/Set usage** in `workspace/load-state.ts` (lines 584, 605)
- **Remove redundant `| undefined`** on optional properties in handler args (`install/handler.ts:86,88`, `init/handler.ts:36`)

## Capabilities

### New Capabilities

None—this is a refactoring change with no new user-facing behavior.

### Modified Capabilities

None—internal implementation only, no spec-level behavior changes.

## Impact

- **Type definitions**: `extensions/skills/types.ts`, `extensions/skills/state/types.ts`, `extensions/skills/github-api.ts`, `extensions/skills/git.ts`, `extensions/skills/skill-discovery.ts`, `resolution/types.ts`, `clack-effect/types.ts`, `clack-effect/errors.ts`, `clack-effect/test.ts`, `workspace/service.ts`, `workspace/load-state.ts`, `workspace/errors.ts`, `workspace/apply.ts`, `agents/types.ts`, `agents/detection.ts`, `lockfile/lockfile.ts`, `settings/settings.ts`
- **Handler args**: `cli-commands/skills/install/handler.ts`, `cli-commands/skills/uninstall/handler.ts`, `cli-commands/init/handler.ts`
- **Barrel files**: `extensions/skills/index.ts`, `workspace/index.ts`, `cli-commands/skills/display.ts`
- **Error handling**: `workspace/apply.ts`, `main.ts`
- **Schema validation**: `workspace/load-state.ts`, `workspace/service.ts`, `extensions/skills/wellknown.ts`
- **Imports**: All files importing re-exported types must update to import from owning modules
- **Tests**: May need updates where optional properties or array types are accessed
