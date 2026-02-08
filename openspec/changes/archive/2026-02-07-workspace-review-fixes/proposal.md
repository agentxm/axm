## Why

Code review of `packages/cli/src/workspace/` found multiple convention violations against CLAUDE.md guidance: use of `node:path`/`node:os` in production code, backwards-compatibility re-exports, optional properties instead of `Option`, native array methods instead of Effect's `Array`, and template-string path concatenation.

## What Changes

- **Remove `node:os` and `node:path` from `paths.ts`**: Replace with `@effect/platform` `Path` service. `getGlobalDir`, `getProjectDir`, and `getAxmDir` become effectful (requiring `Path`). Callers already operate in Effect context.
- **Remove backwards-compat re-exports from `paths.ts`**: `LOCKFILE_NAME` and `SETTINGS_FILENAME` re-exports are unused — no consumers import these from `workspace/paths`. Delete the re-exports.
- **Remove duplicate type re-exports from `apply-plan.ts`**: **BREAKING** — `apply-plan.ts` re-exports `JobStep`, `JobStepResult`, `OperationResult`, `PlannedJobStep` from `plan.ts`, duplicating the barrel export. Remove them; consumers import plan types from the barrel `index.ts`.
- **Change `agents?` to `Option` on `WorkspaceContextOptions`**: Replace `readonly agents?: readonly string[]` with `readonly agents: Option<readonly string[]>` per the `Option` over optional properties convention.
- **Replace native array methods with Effect `Array`**: In `display-plan.ts` use `Array.flatMap` and `Array.filter`; in `apply-plan.ts` use `Array.map` instead of native `.map()`.
- **Use `Path.join` for path concatenation in `service.ts`**: Replace template-string path building (`${dir}/${file}`) with `@effect/platform` `Path.join`.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `workspace-plan`: Remove requirement "OperationResult re-exported from apply-plan" — the barrel already exports all plan types; the dual export path is unnecessary and backwards compatibility is a non-goal.

## Impact

- `packages/cli/src/workspace/paths.ts` — API change: functions become effectful (return `Effect<string, never, Path>`)
- `packages/cli/src/workspace/paths.test.ts` — Must run in Effect context
- `packages/cli/src/workspace/service.ts` — Signature change for `agents` option; path operations use `Path` service
- `packages/cli/src/workspace/apply-plan.ts` — Remove re-export line
- `packages/cli/src/workspace/display-plan.ts` — Swap to Effect `Array` functions
- `packages/cli/src/workspace/index.ts` — Update barrel if needed
- Callers of `getAxmDir`/`getGlobalDir`/`getProjectDir` and `WorkspaceContextOptions.agents` must adapt
