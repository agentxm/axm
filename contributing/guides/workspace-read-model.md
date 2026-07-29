# Workspace Read Model Guide

Use `makeWorkspaceReadModel(scope)` for workspace reads that need scoped,
cached state.

Use `WorkspaceMutations` for settings, lockfile, or materialized workspace
changes. New read-only code should use `WorkspaceReadModel` projections.
Apply the authority boundaries in [Workspace State](./workspace-state.md):
settings, observations, trust, and receipt rows are not interchangeable cells.

> [Effect Layers Guide](./effect-layers.md) - layer construction and provision

## Scope Model

`makeWorkspaceReadModel("project")` and `makeWorkspaceReadModel("user")` each
build a `WorkspaceReadModel` for one scope. The returned value owns that
scope's `.axm` settings, lockfile, scanners, source hosts, profile, agents,
extension projections, and diagnostics.

Construct one read model at the command boundary. Pass it inward instead of
recomputing paths or reading settings directly. Callers that need both scopes
invoke the factory twice.

`makeWorkspaceReadModel` requires `FileSystem`, `Path`,
`WorkspaceReadModelConfig`, and `AgentRootResolver` in the environment.
`AgentRootResolverLive` builds the cross-scope resolver state and runs
agent-root collision detection once per layer; share it across both scope
calls so the warnings deduplicate.

## Caching

Cells cache for the lifetime of the returned value:

- `state.settings`, `state.lockfile`, and `state.raw(...)`
- scanner-backed `actual` views
- projection-backed `installed`, `active`, `unmanaged`, and `ignored`

Ad hoc disk reads re-read state on every call. The read model does not. In a
write-then-read flow, either reconstruct the read model after the write, use
the operation's in-memory updated value, or keep a narrowly documented
fresh-read path until the write pipeline owns reconstruction.

Example:

```ts
yield * writeSettings(axmDir, updated);
const fresh = yield * makeWorkspaceReadModel(scope);
const settings = yield * fresh.state.settings;
```

## Record Rows

`WorkspaceMutations.records` exposes two readers: `getExtensionInventory(type,
options)` and `rows(type)`. `rows` is total over `InstallableExtensionType` and
non-throwing — a type with nothing installed yields an empty array — so a new
extension type needs no new accessor.

Each `ReadModelRecordRow` carries `type`, `name`, `source`, `enabled`,
`packagingKind`, and a `lifecycle` discriminant. Narrow with the helpers in
`workspace/read-model-record-rows.ts` rather than re-deriving predicates:

```ts
const configured = yield * ws.records.rows("skill").pipe(Effect.map(configuredRowsByName));
```

`configuredRowsByName`, `installedRowsByName`, and `unmanagedRowsByName` return
name-indexed maps; `configuredRecordRows`, `installedRecordRows`, and
`unmanagedRecordRows` return arrays when order matters.

## Write-Path Fresh Reads

Manager mutation flows deliberately do **not** read through `records.rows`.
Each `WorkspaceMutations.getConfigured*Entries()` call builds a fresh
`makeWorkspaceReadModel` instance, so a read taken mid-flow observes settings
that the same flow just wrote. A command-scoped cached read model would return
the pre-write snapshot and the materialize pass would skip or duplicate work.

Leave these sites on `WorkspaceMutations`:

- `files/manager.ts` — `materializeInstall` input resolution, `getConfiguredSource`,
  `listMaterializable`, `upsertSettingsEntry` read-modify-write
- `rules/manager.ts` — the render/sync pass over configured rules,
  `getConfiguredSource`, `listMaterializable`
- `hooks/manager.ts` — the render pass, the sync pass, `getConfiguredSource`,
  `listMaterializable`, `upsertSettingsEntry` read-modify-write
- `knowledge/manager.ts` — `writeIndex` during install/uninstall,
  `getConfiguredSource`, `listMaterializable`
- `mcps/operations/{install,enable,disable}.ts`, the `new-*` operations for
  skills, subagents, and hooks, and the CLI `demote` settings dispatcher

The invariant is behavioral, not typed: nothing stops a future mechanical
migration from swapping one of these for a cached read. Check the flow writes
settings before it reads them again before touching any of them.

## State Cells

Use `state.settings` and `state.lockfile` when callers need decoded, typed
data and should see parse/decode errors.

Use `state.raw("settings")` or `state.raw("lockfile")` when a rule must
distinguish missing bytes from invalid bytes, or when another rule owns schema
diagnostics.

## Tests

Use `WorkspaceReadModelTest` from
`packages/core/src/unstable/workspace/read-model/__fixtures__/test-layer.ts`.
Build fixtures with `validAll`, `absentAll`, or explicit `FixtureSpec` data.
The layer provides `FileSystem`, `Path`, `WorkspaceReadModelConfig`, and
`AgentRootResolver` so test bodies just call `makeWorkspaceReadModel(scope)`.

Example:

```ts
const layer = WorkspaceReadModelTest(validAll("/workspace", "/home"));
yield *
  Effect.gen(function* () {
    const project = yield* makeWorkspaceReadModel("project");
    const installed = yield* project.skills.installed;
    expect(installed.length).toBeGreaterThan(0);
  }).pipe(Effect.provide(layer));
```

Avoid mocking `readSettings`, `readLockfile`, or registry helpers in tests for
read-model-backed production code. Mock only the module under direct test.

## Pitfalls

- Do not build a new read model inside each rule or projection row.
- Do not reuse a read model after mutating settings or lockfile and expect
  fresh reads.
- Do not call path helpers outside read-model construction unless the code is
  itself constructing the read model.
- Do not filter installed arrays repeatedly when `byName` or declared lookup
  APIs express the intent.
