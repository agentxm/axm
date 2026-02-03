## Why

The `skills install` handler (`packages/cli/src/commands/skills/install/handler.ts`) is 1100+ lines containing utility functions that will be duplicated when implementing other skill commands (`update`, `enable`, `disable`) and other extension type commands (`commands install`, `mcps install`, `packs install`). Factoring out common code now prevents copy-paste proliferation and establishes reusable patterns before the codebase grows.

## What Changes

### Core Package (`@agentxm/core`)

- **New `paths` module**: Add `getAxmDir()`, `getProjectDir()`, `getGlobalDir()` for AXM directory resolution
- **Enhance `source-parser`**: Move `buildCloneUrl()` and `getOriginFromParsed()` from handler to source-parser module

### CLI Package (`@agentxm/cli`)

- **New `spinner` utility**: Extract `createSpinnerHelper()` for consistent spinner/fallback-to-log pattern
- **New `prompts` utility**: Extract Effect-wrapped @clack/prompts helpers:
  - Generic `promptMultiselect<T>()` and `promptSelect<T>()`
  - Generic `promptConfirm()`
  - `canPrompt()` helper for checking interactivity with `--yes`/`--non-interactive` flags
- **New skills `utils` module**: Extract `selectExtensionRef()` for handling resolution results (empty → error, single → return, multiple → prompt)
- **Enhance `errors` utility**: Add `formatEmptyResolutionError()` for consistent resolution failure messages

### Handler Simplification

- Reduce `handler.ts` by ~260 lines (~23%) by importing extracted utilities
- Handler focuses on orchestration, not utility implementation

## Capabilities

### New Capabilities

None. This is an internal refactoring with no user-facing behavior changes.

### Modified Capabilities

None. No spec-level behavior changes.

## Impact

| Area                 | Files Affected                                                           |
| -------------------- | ------------------------------------------------------------------------ |
| **Core (new)**       | `packages/core/src/experimental/paths.ts`                                |
| **Core (modified)**  | `packages/core/src/experimental/skills/source-parser.ts`                 |
| **CLI (new)**        | `packages/cli/src/utils/spinner.ts`, `packages/cli/src/utils/prompts.ts` |
| **CLI (new)**        | `packages/cli/src/commands/skills/utils.ts`                              |
| **CLI (modified)**   | `packages/cli/src/utils/errors.ts`                                       |
| **CLI (simplified)** | `packages/cli/src/commands/skills/install/handler.ts`                    |

No breaking changes. All modifications are internal implementation details.
