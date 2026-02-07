## Why

The install handler builds `AddSkillOperation[]` and scaffolds a `Plan`, but never does anything with it. There is no lockfile reconciliation, no plan display, and no plan execution. The handler ends with `clack.outro("Done")` regardless of what was selected. Users cannot install skills.

## What Changes

- **Build plan with lockfile awareness**: Compare operations against lockfile state. Already-installed skills become `no-op` (unless `--force`), new skills become `execute`.
- **Display plan**: Format and show the plan summary (what will be installed, what will be skipped). Dry-run stops here.
- **Confirm plan**: When not `--yes` and not `--dry-run`, prompt the user to confirm before executing.
- **Execute plan**: Apply `execute` actions — log "skill installed" to console per action. Actual file copying and lockfile updates are out of scope.
- **Remove legacy scaffolding**: Delete inline `_plan` construction, `buildIdealFromOperations`, and any dead code related to plan building or applying in the handler and ideal-state module. Replace with calls to new modules.

## Design Considerations

The plan infrastructure will be reused across extension types (commands, mcp-servers, rules, etc.). Operation construction is extension-specific — each extension type knows how to diff its operations against current state. Plan display and execution are generic — they operate on the plan structure regardless of what produced it. Design the plan types and display/apply modules to be extension-agnostic so they can be shared.

## Capabilities

### New Capabilities

- `install-plan-build`: Build a plan by diffing operations against lockfile state. Determines action (execute vs no-op) per operation. Skills-specific for now, but plan types should be extension-agnostic.
- `install-plan-display`: Format and display the plan to the user via Clack UI. Extension-agnostic — operates on plan structure only.
- `install-plan-apply`: Execute plan actions — log installation result to console per action. Actual skill copying and lockfile writes are out of scope.

### Modified Capabilities

- `cli-skills-install`: Handler wires plan build → display → confirm → apply instead of stopping after operation construction.

## Out of Scope

- Actual skill file copying into workspace directories
- Lockfile write path (reading lockfile for plan build is in scope)
- Force reinstall behavior
- Concurrent write coordination for lockfile/settings — when job steps execute concurrently, multiple actions may need to write to the same file. This will need a serialization strategy (e.g., collect writes and flush once, or a write lock) but is deferred until apply is real

## Impact

- `packages/cli/src/cli-commands/skills/install/handler.ts` — major rewrite of post-selection flow
- `packages/cli/src/workspace/ideal-state.ts` — Plan/Action types may need refinement
- New modules in `packages/cli/src/cli-commands/skills/install/` for plan build, display, and apply
