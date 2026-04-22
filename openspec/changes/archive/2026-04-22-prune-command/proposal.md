## Why

Stale and orphaned extension artifacts (skills, commands, subagents) accumulate in workspaces over time. Lint detects them but only advises manual deletion — auto-fix would be too aggressive for a linter. Users and agents need a deliberate, confirmable cleanup command. Additionally, the universal skills directory (`.agents/skills/`) is currently skipped entirely by the stale-artifact lint check, hiding genuinely orphaned artifacts that no agent claims.

## What Changes

- Add `axm prune` command that removes unmanaged, non-ignored extension artifacts (skills-only in v1; other types added as their disk detection is wired up)
- Add `axm skills prune [patterns...]` scoped to skills, with optional glob patterns (e.g., `effect-*`) to filter which artifacts to prune
- Confirmation UX: preview what will be deleted, prompt for confirmation, `--yes` flag to skip
- Extract stale-artifact detection into shared logic consumed by both lint rules and the prune command (single source of truth)
- Fix lint `skills-artifacts-clean` to check the universal skills directory (`.agents/skills/`) instead of skipping it — flag artifacts not declared/enabled by any agent that uses the universal dir
- Update lint advisory messages to suggest `axm prune` as the remediation action

## Capabilities

### New Capabilities

- `cli-prune`: Workspace-wide and per-extension-type prune commands for removing unmanaged, non-ignored artifacts with confirmation UX and glob filtering

### Modified Capabilities

- `workspace-reconciliation`: Stale-artifact detection logic is extracted into a shared module; universal skills directory is no longer skipped in stale checks — artifacts are flagged when no agent claims them

## Impact

- New CLI commands: `axm prune`, `axm skills prune` (other extension types added later)
- Lint detection module refactored: `skills-artifacts-clean` stale-detection logic extracted for reuse
- Lint output changes: advisory messages reference `axm prune` instead of "delete manually"
- Universal skills dir (`.agents/skills/`) will now surface stale findings in lint that were previously hidden
