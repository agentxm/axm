## Why

When the lockfile is missing, install commands currently recreate entries only for the extension type touched by that command. Because lockfile state is cross-extension, this can leave an incomplete snapshot and weaker reproducibility than package-manager-style behavior.

## What Changes

- Any install flow that runs with no lockfile will treat that run as a full reconciliation event for all managed extension types, analogous to npm/pnpm lockfile regeneration.
- Reconciliation will be settings-authoritative (active scope), with disk used as an optimization path only when local materialization matches the declaration and validates.
- A single install request with missing lockfile will produce a lockfile representing the full current managed extension state (skills, commands, packs, mcp servers), not just the requested item.

## Capabilities

### New Capabilities

- `lockfile-bootstrap-from-workspace`: Build an initial cross-extension lockfile snapshot from existing managed workspace state when no lockfile exists.

### Modified Capabilities

- `cli-skills-install`: Missing-lockfile installs SHALL trigger cross-extension lockfile bootstrap before normal planning/execution.
- `commands-install-execute`: Missing-lockfile installs SHALL trigger cross-extension lockfile bootstrap before normal execution.
- `mcp-servers-install-execute`: Missing-lockfile installs SHALL trigger cross-extension lockfile bootstrap before normal execution.
- `cli-packs-install`: Missing-lockfile installs SHALL trigger cross-extension lockfile bootstrap before normal planning/execution.

## Impact

- Shared bootstrap orchestration in workspace/lockfile services (`packages/cli/src/workspace/`, `packages/cli/src/lockfile/`).
- Install entrypoints for skills/commands/packs/mcp-servers to call shared bootstrap when lockfile is absent.
- Per-extension reconstruction adapters in extension domains (`packages/cli/src/extensions/`).
- Tests (unit + e2e) validating deleted-lockfile recovery regenerates full cross-extension snapshot.
