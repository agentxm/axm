## Why

Install/uninstall flows for `skill`, `mcp-server`, and `pack` currently duplicate lifecycle logic across command handlers and per-extension operations. Command handlers also repeat orchestration phases (source parsing, source-host resolution, discovery, and plan setup). This creates drift risk in both orchestration and `SettingsDocument` / `LockfileDocument` updates, and makes bug fixes (for example lockfile add/remove parity) expensive and inconsistent.

We need one shared lifecycle core that preserves the existing plan/job composition model while moving common behavior into a single place.

## What Changes

- Introduce a shared extension lifecycle core for install/uninstall planning and execution.
- Introduce command-family workflows (for example one shared install workflow across install commands, one shared uninstall workflow across uninstall commands) that reuse shared primitives, rather than one generic workflow for all command families.
- Keep the current plan/job model, but route install/uninstall behavior through shared operation planning/execution.
- Add per-`ExtensionType` lifecycle hooks (`skill`, `pack`) for type-specific behavior in this change.
- Keep `mcp-server` and `command` lifecycle integration as explicit no-op placeholders for now.
- Model `pack` dependency expansion as cross-type intents for supported types in this change (`skill` only).
- Support `skill` variation by `PackagingKind` (`native` vs `non-native`) in hook logic.
- Centralize `SettingsDocument` and `LockfileDocument` mutations so all extension types share identical add/remove/update semantics.
- Add readiness-aware planned job steps: steps marked `error` are non-runnable, and `resolvePlan` executes only ready job step `run` effects.

## Capabilities

### New Capabilities

- `shared-extension-lifecycle-core`: Shared install/uninstall lifecycle pipeline with centralized workspace state mutations and per-type hooks.
- `command-family-lifecycle-workflows`: Dedicated workflow per command family (install, uninstall) built from shared primitives and reused across supported command members in this change (`skill`, `pack`).

### Modified Capabilities

- `cli-skills-install`: Uses install-family workflow + shared lifecycle core with `skill` hook native/non-native branching.
- `cli-skills-uninstall`: Uses uninstall-family workflow + shared lifecycle core for consistent uninstall mutation semantics.
- `cli-packs-install`: Uses install-family workflow + shared lifecycle core and `pack` dependency intent expansion for supported types (`skill`).
- `cli-packs-uninstall`: Uses uninstall-family workflow + shared lifecycle core, including dependency-retention semantics for supported types (`skill`).

## Impact

- Workspace planning/execution internals (`packages/cli/src/workspace/`) for shared lifecycle core and mutation executor.
- Shared command primitives in CLI command layer (`packages/cli/src/cli-commands/` or shared workflow module) used by command-family workflows.
- Extension feature modules (`packages/cli/src/extensions/`) to expose hook contracts and type-specific materialization.
- Pack install/uninstall planning (`packages/cli/src/cli-commands/packs/`) to emit/consume cross-type intents.
- `skill` install/uninstall paths to delegate common lifecycle logic to the shared core.
- `pack` install/uninstall paths to delegate common lifecycle logic to the shared core.
- Unit and integration tests covering lockfile/settings parity across extension types and idempotent install/uninstall behavior.

## Expected CLI Output

The lifecycle-kernel internals use mutation steps, but CLI output remains extension-oriented for readability.

Example (`axm packs install effect` with multiple dependencies):

```text
info axm packs install (project)
...source/discovery logs...
info Install pack
Install pack @axm/packs/effect
success   ✓ effect
success   ✓ effect-testing
success   ✓ effect-wrapping
warn   - effect-basics (already installed)
success   ✓ effect-option
...
applied install operations in plan order
success Done
```

Mutation-level details (for example lockfile upsert vs materialization step) are hidden by default and may be shown only in debug/verbose modes. Readiness errors render as non-runnable steps and prevent apply.

## Explicit Non-Goals

- Refactoring publish/update/fork/enable/disable flows.
- Adding `command` or `mcp-server` lifecycle integration in this change (explicit no-op placeholders only).
- Replacing the existing plan/job abstraction.
- Broad CLI redesign beyond migration-scoped consistency updates (for this change: remove `skills install --list`, remove `skills install/uninstall --agent`, and use workflow diagnostics + `--preview`).
- Creating a single generic command workflow that over-generalizes unrelated command families (for example install, uninstall, enable, disable, fork).
