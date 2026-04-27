# Workspace Read Model Guide

Use `WorkspaceReadModel` for workspace reads that need scoped, cached state.

Use `WorkspaceMutations` for settings, lockfile, or materialized workspace
changes. New read-only code should use `WorkspaceReadModel` projections.

> [Effect Layers Guide](./effect-layers.md) - layer construction and provision

## Scope Model

`WorkspaceReadModel` exposes `ctx.scope("project")` and `ctx.scope("user")`.
Each scoped object owns that scope's `.axm` settings, lockfile, scanners,
source hosts, profile, agents, extension projections, and diagnostics.

Construct one context at the command boundary. Pass scoped APIs inward instead
of recomputing paths or reading settings directly.

## Caching

Cells cache for the lifetime of the context instance:

- `state.settings`, `state.lockfile`, and `state.raw(...)`
- scanner-backed `actual` views
- projection-backed `installed`, `active`, `unmanaged`, and `ignored`

Ad hoc disk reads re-read state on every call. `WorkspaceReadModel` does not. In a
write-then-read flow, either reconstruct the context after the write, use the
operation's in-memory updated value, or keep a narrowly documented fresh-read
path until the write pipeline owns reconstruction.

Example:

```ts
yield * writeSettings(axmDir, updated);
const fresh =
  yield *
  makeWorkspaceReadModel(options).pipe(Effect.flatMap((ctx) => ctx.scope(scope).state.settings));
```

## State Cells

Use `state.settings` and `state.lockfile` when callers need decoded, typed
data and should see parse/decode errors.

Use `state.raw("settings")` or `state.raw("lockfile")` when a rule must
distinguish missing bytes from invalid bytes, or when another rule owns schema
diagnostics.

## Tests

Use `WorkspaceReadModelTest` from
`packages/core/src/unstable/workspace/context/__fixtures__/test-layer.ts`.
Build fixtures with `validAll`, `absentAll`, or explicit `FixtureSpec` data.

Example:

```ts
const layer = WorkspaceReadModelTest(validAll("/workspace", "/home"));
yield *
  Effect.gen(function* () {
    const ctx = yield* WorkspaceReadModel;
    const installed = yield* ctx.scope("project").skills.installed;
    expect(installed.length).toBeGreaterThan(0);
  }).pipe(Effect.provide(layer));
```

Avoid mocking `readSettings`, `readLockfile`, or registry helpers in tests for
context-backed production code. Mock only the module under direct test.

## Pitfalls

- Do not build a new context inside each rule or projection row.
- Do not reuse a context after mutating settings or lockfile and expect fresh
  reads.
- Do not call path helpers outside context construction unless the code is
  itself constructing the context.
- Do not filter installed arrays repeatedly when `byName` or declared lookup
  APIs express the intent.
