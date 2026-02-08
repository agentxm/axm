## Context

The workspace module (`packages/cli/src/workspace/`) was reviewed against CLAUDE.md conventions and found 6 categories of violation. All are internal implementation concerns — no user-facing behavior changes. The module is already effectful (service layer, handlers), so adopting `@effect/platform` and Effect idioms is straightforward.

Current callers of the affected APIs:

- `getAxmDir` — called only from `service.ts` (already in Effect context)
- `getGlobalDir`/`getProjectDir` — exported from barrel but only used in `paths.test.ts`
- `WorkspaceContextOptions.agents` — used in `service.ts`, handler tests for install/uninstall/init, and `runtime/index.ts`

## Goals / Non-Goals

**Goals:**

- Align workspace module with CLAUDE.md conventions
- Use `@effect/platform` for path operations in production code
- Use `Option` instead of optional properties
- Use Effect `Array` functions consistently
- Remove unnecessary re-exports

**Non-Goals:**

- Changing workspace behavior or public API semantics
- Refactoring the mutable `let` pattern in `initializeProjectWorkspace` / `ensureAgentsConfigured` (noted in review but complex branching makes alternatives less readable — defer)
- Touching test files beyond what's needed to adapt to API changes

## Decisions

### 1. Make path functions effectful via `Path` service

`getGlobalDir`, `getProjectDir`, and `getAxmDir` currently use `node:os` and `node:path`. Replace with `@effect/platform` `Path.Path` for `path.join`.

For `os.homedir()`, there is no `@effect/platform` equivalent. Use `Effect.sync(() => os.homedir())` to wrap the side-effectful call, keeping `node:os` as the sole Node import. This is acceptable — `os.homedir()` is not a filesystem operation but an environment query.

**Alternative considered**: Keep functions pure/synchronous and accept the `node:path` import as pragmatic. Rejected — CLAUDE.md is explicit: "never `node:path` in production code."

**Signature change:**

```typescript
// Before
export const getAxmDir = (global: boolean): string
// After
export const getAxmDir = (global: boolean): Effect.Effect<string, never, Path.Path>
```

### 2. Remove backwards-compat re-exports from `paths.ts`

Lines 15-16 re-export `LOCKFILE_NAME` and `SETTINGS_FILENAME` from `../lockfile/index.js` and `../settings/index.js`. Grep confirms zero consumers import these from `workspace/paths`. Delete them.

### 3. Remove type re-exports from `apply-plan.ts`

Line 15 re-exports `{ JobStep, JobStepResult, OperationResult, PlannedJobStep }` from `./plan.js`. The barrel `index.ts` already exports these from `./plan.js` directly. The existing `workspace-plan` spec has a requirement mandating these re-exports — that requirement will be removed via a delta spec (backwards compatibility is a non-goal).

### 4. `agents` property: `Option` over optional

Change `readonly agents?: readonly string[]` to `readonly agents: Option.Option<readonly string[]>` on `WorkspaceContextOptions`. Callers in handler files already work with `Option` for other fields — they'll use `Option.fromNullable` at the yargs boundary.

### 5. Effect `Array` for collection operations

Replace native `.flatMap()`, `.filter()`, `.map()` with Effect's `Array.flatMap`, `Array.filter`, `Array.map` in:

- `display-plan.ts:28` — `plan.jobs.flatMap(...)` → `Array.flatMap(plan.jobs, ...)`
- `display-plan.ts:36-38` — `.filter(...)` → `Array.filter(...)`
- `apply-plan.ts:116` — `jobResults.map(...)` → `Array.map(jobResults, ...)`

### 6. `Path.join` for path concatenation in `service.ts`

Replace `${globalDir}/${SETTINGS_FILENAME}` and `${globalDir}/${LOCKFILE_NAME}` (lines 249-250) with `yield* path.join(globalDir, SETTINGS_FILENAME)` using the `Path` service. The enclosing `ensureGlobalWorkspaceInitialized` function already runs in Effect context.

## Risks / Trade-offs

- **Path functions become effectful** — Callers must `yield*` instead of calling directly. Risk is low since the sole production caller (`service.ts`) is already effectful. Tests need to run in Effect context (use `@effect/vitest`). → Mitigation: Only one production call site to update.
- **`agents` Option change touches multiple test files** — Handler tests for install, uninstall, and init construct `WorkspaceContextOptions` directly. → Mitigation: Mechanical change — wrap with `Option.some(...)` or `Option.none()`.
