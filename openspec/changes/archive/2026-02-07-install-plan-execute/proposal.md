## Why

The install handler builds `AddSkillOperation[]` and scaffolds a `Plan`, but never does anything with it. There is no lockfile reconciliation, no plan display, and no plan execution. The handler ends with `clack.outro("Done")` regardless of what was selected. Users cannot install skills.

## What Changes

- **Build plan with lockfile awareness**: Compare operations against lockfile state. Already-installed skills become `no-op`, new skills become `execute`.
- **Display plan**: Format and show the plan summary (what will be installed, what will be skipped). Preview stops here.
- **Confirm plan**: When not `--yes` and not `--preview`, prompt the user to confirm before executing.
- **Execute plan**: Apply `execute` actions — log "skill installed" to console per action. Actual file copying and lockfile updates are out of scope.
- **Replace sketch code**: The handler's inline `_plan` construction and TODO comments are replaced by calls to the new build, display, and apply modules. The `ideal-state.ts` file is deleted and its contents redistributed.

## Design Considerations

The plan infrastructure will be reused across extension types (commands, mcp-servers, rules, etc.) and across operation types (install, uninstall). Operation construction and plan building are extension-specific — each extension type knows how to diff its operations against current state. Plan types, display, and apply orchestration are generic — they operate on the plan structure regardless of what produced it. These shared elements live in the workspace module from the start to avoid restructuring when the next consumer arrives.

## Capabilities

### New Capabilities

- `workspace-plan`: Generic plan types (`Plan<Op>`, `Job<Op>`, `Action<Op>`), plan display via Clack, and apply orchestration (iterate execute actions, skip no-ops, log results). Shared across all extension types and operations.
- `skills-install-build-plan`: Build a plan by diffing `AddSkillOperation[]` against lockfile state. Skills-specific — knows how to compare skill names against lockfile entries.

### Modified Capabilities

- `cli-skills-install`: Handler wires plan build → display → confirm → apply instead of stopping after operation construction.

## Out of Scope

- Actual skill file copying into workspace directories
- Lockfile write path (reading lockfile for plan build is in scope)
- Force reinstall behavior
- Concurrent write coordination for lockfile/settings — when job steps execute concurrently, multiple actions may need to write to the same file. This will need a serialization strategy (e.g., collect writes and flush once, or a write lock) but is deferred until apply is real

## Impact

- `packages/cli/src/cli-commands/skills/install/handler.ts` — major rewrite of post-selection flow
- `packages/cli/src/workspace/ideal-state.ts` — deleted, contents redistributed
- `packages/cli/src/workspace/plan.ts` — new shared generic plan types
- `packages/cli/src/workspace/display-plan.ts` — new shared plan display
- `packages/cli/src/workspace/apply-plan.ts` — new shared plan apply stub
- `packages/cli/src/workspace/index.ts` — barrel updated to export plan, display-plan, apply-plan
- `packages/cli/src/cli-commands/skills/operations.ts` — skill operation types and SkillRef moved from workspace/install
- `packages/cli/src/cli-commands/skills/install/build-plan.ts` — new skills-specific plan builder
- `packages/cli/src/cli-commands/skills/install/discover-skills.ts` — SkillRef removed (lifted to skills/operations.ts)
