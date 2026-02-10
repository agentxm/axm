## Reference

See [docs/designs/dry-run/dry-run-sketch.md](../../../docs/designs/dry-run/dry-run-sketch.md) for the full architectural design.

## Why

The current `skills install` implementation executes file operations directly without previewing what will happen. Users cannot verify installation plans before committing, CI/CD pipelines cannot safely test installation logic, and debugging requires cleanup after every run. A state-based dry-run architecture (inspired by npm's Arborist) enables showing exactly what will change before making changes, while unifying validation logic for future `doctor` and `sync` commands.

## What Changes

- Add `--dry-run` flag to `axm skills install` that displays the installation plan without applying changes
- Refactor install handler to use a three-phase architecture: load state → compute diff → apply (or display for dry-run)
- Introduce state types modeling actual (disk), locked (lockfile), and ideal (desired) skill states
- Compute validity diagnostics by comparing actual vs locked state (orphaned, missing, hash mismatch, etc.)
- Diff computation produces a plan (add/update/remove/repair/unchanged) from current vs ideal state
- Same display format for both dry-run and real execution (plan shown before confirmation)
- Add `--json` flag for machine-readable plan output

## Capabilities

### New Capabilities

- `skills-state`: State model for skills (actual, locked, ideal), validity computation, diff/plan generation, and apply logic. This is the core infrastructure that enables dry-run and will be reused by future commands (update, uninstall, sync, doctor).

### Modified Capabilities

- `cli-skills-install`: Adding `--dry-run` and `--json` flags, refactoring handler to use state-based architecture instead of direct file operations.

## Impact

- **packages/core**: New `skills/state/` module with types, loading, ideal builders, diff computation, and apply logic
- **packages/cli**: Refactored `skills install` handler, new `--dry-run` and `--json` flags
- **Testing**: Unit tests for state loading, diff computation; E2E tests for dry-run behavior
- **Future commands**: Same state model will power `update`, `uninstall`, `sync`, `doctor`, and `prune`
