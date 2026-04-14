## Why

Doctor's check graph covers workspace readiness, agent configuration, extension installation, and extension activation — but not whether installed extensions are current. Users have no single command to see what's outdated or to update everything at once. Per-type update commands exist (`axm skills update`, `axm subagents update`, `axm commands update`) but there's no root `axm update` or `axm outdated` to operate across all extension types, and doctor doesn't surface version currency.

## What Changes

- Add an `extensions-current` doctor check that compares installed versions against the registry and emits `info`-severity findings for available updates
- Add a root `axm update` command that aggregates per-type update workflows across all extension types, following the same pattern as root `axm install` (no-arg workspace mode + FQN single-extension mode)
- Add a root `axm outdated` command that reports installed vs available versions for all configured extensions (read-only, no mutations)

## Capabilities

### New Capabilities

- `cli-update`: Root `axm update` command — update all configured extensions or a single extension by FQN, dispatching to per-type update workflows
- `cli-outdated`: Root `axm outdated` command — read-only report of installed vs available versions across all configured extensions
- `doctor-extensions-current`: Doctor check that surfaces version currency findings as `info` severity, depending on `extensions-installed`

### Modified Capabilities

_(none — no existing spec requirements change)_

## Impact

- `packages/core/src/unstable/workspace/doctor/` — new `checks/extensions-current.ts` check, registered in `diagnose.ts`
- `packages/cli/src/root/` — new `update/` and `outdated/` command directories following the `install/` pattern
- `packages/cli/src/root/_root.ts` — register `update` and `outdated` as top-level commands
- Registry client — used for fetching `ExtensionIndex` to compare versions; no new API methods needed
- Version constraints module — used for `satisfiesConstraint` and `resolveVersionWithConstraint`; no changes needed
- Per-type update workflows — consumed by root `axm update` via `*CommandWorkflowActions` services; no changes needed
