## Why

The install handler builds `AddSkillOperation[]` and scaffolds a `Plan`, but never does anything with it. There is no lockfile reconciliation, no plan display, and no plan execution. The handler ends with `clack.outro("Done")` regardless of what was selected. Users cannot install skills.

## What Changes

- **Build plan with lockfile awareness**: Compare operations against lockfile state. Already-installed skills become `no-op` (unless `--force`), new skills become `execute`.
- **Display plan**: Format and show the plan summary (what will be installed, what will be skipped). Dry-run stops here.
- **Confirm plan**: When not `--yes` and not `--dry-run`, prompt the user to confirm before executing.
- **Execute plan**: Apply `execute` actions — copy skill files to the workspace and update the lockfile.
- **Remove legacy scaffolding**: Delete the inline `_plan` construction and TODO comments in the handler. Replace with calls to new modules.

## Capabilities

### New Capabilities

- `install-plan-build`: Build a plan by diffing operations against lockfile state. Determines action (execute vs no-op) per operation.
- `install-plan-display`: Format and display the plan to the user via Clack UI.
- `install-plan-apply`: Execute plan actions — copy skill directories into the workspace skills dir and update the lockfile entry for each installed skill.

### Modified Capabilities

- `cli-skills-install`: Handler wires plan build → display → confirm → apply instead of stopping after operation construction.

## Impact

- `packages/cli/src/cli-commands/skills/install/handler.ts` — major rewrite of post-selection flow
- `packages/cli/src/workspace/ideal-state.ts` — Plan/Action types may need refinement
- `packages/cli/src/lockfile/` — lockfile write path exercised for the first time during install
- New modules in `packages/cli/src/cli-commands/skills/install/` for plan build, display, and apply
