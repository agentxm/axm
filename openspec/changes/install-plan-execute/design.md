## Context

The install handler (`handler.ts`) currently builds `AddSkillOperation[]` from selected skills, reads the lockfile and settings, constructs an inline `_plan` with TODO comments, and exits with `clack.outro("Done")`. The plan types (`Plan`, `Job`, `Action`) exist in `workspace/ideal-state.ts` but are never consumed. There is no lockfile comparison, no plan display, no confirmation flow, and no execution.

The `workspace/ideal-state.ts` file contains both operation types (`AddSkillOperation`, `RemoveSkillOperation`, `WorkspaceOperation`) and plan types (`Plan`, `Job`, `Action`). The plan types are currently not generic — `Action.op` is typed as `WorkspaceOperation`, coupling them to the skills domain.

## Goals / Non-Goals

**Goals:**

- Wire the install handler through build → display → confirm → apply
- Make plan types generic so they can be reused for commands, mcp-servers, rules, etc.
- Place shared plan infrastructure (types, display, apply) in the workspace module from the start
- Display a human-readable plan summary via Clack
- Support `--dry-run` (display only) and `--yes` (skip confirmation)
- Stub apply to log "installed" per action (no real side effects)
- Remove inline plan scaffolding and dead code from the handler

**Non-Goals:**

- Actual file copying or lockfile writes during apply
- Force reinstall logic (lockfile presence → no-op regardless of source match)
- Concurrent write coordination for lockfile/settings
- Backward compatibility with current handler behavior (it doesn't do anything useful)

## Decisions

### 1. Generic plan types with a `label` field on Action

Make `Action<Op>`, `Job<Op>`, and `Plan<Op>` generic over the operation type. Add a `label: string` field to `Action` so display and apply can operate without inspecting the operation. The `action` field supports `"execute" | "no-op" | "error"` — `"error"` is for cases where the plan is constructed from user intent but an anticipated issue would prevent the operation from succeeding (not implemented in this change, but the type should accommodate it).

**Rationale**: The display module needs to render action names, and the apply stub needs to log what was installed. A `label` keeps these modules extension-agnostic. The alternative — having display/apply pattern-match on `op._tag` — couples them to specific extension types. The `Plan.name` field provides a short heading for display (e.g., "Install skill(s)"), while `Plan.description` carries richer context (e.g., "Install skills from github:owner/repo"). Both are set by the build-plan caller. Jobs are purely about execution grouping and concurrency.

**Location**: Create `workspace/plan.ts` for generic plan types. Delete `workspace/ideal-state.ts` — it's a holdover from the old ideal-state reconciliation architecture.

### 2. Shared display and apply in workspace module

Create `packages/cli/src/workspace/display-plan.ts` and `packages/cli/src/workspace/apply-plan.ts`. Both operate on `Plan<Op>` — they read `label`, `action`, and `reason` from `Action<Op>` and never inspect the operation itself.

**Rationale**: These modules will be shared across skills install, skills uninstall, commands install, mcp-servers install, etc. Placing them in workspace from the start avoids a restructuring change when the second consumer arrives. The generic `Plan<Op>` signature means they're already extension-agnostic.

**`displayPlan`**: Depends on `Clack` service. Uses `plan.name` as the heading, shows `plan.description` when present, lists execute actions, no-op actions with reasons under a "skip" heading, and shows a summary count line.

**`applyPlan`**: Depends on `Clack` service. Iterates jobs, executing each job's steps using `Effect.forEach` with the job's `concurrency` setting (`"unbounded"` or `1`). Logs `clack.log.success` for execute actions, skips no-ops. Stub only — no file system mutations.

### 3. Skills-specific plan build in install feature directory

Create `packages/cli/src/cli-commands/skills/install/build-plan.ts`. This module knows how to compare `AddSkillOperation` against `Lockfile` entries by skill name.

**Signature**: `buildPlan(ops: ReadonlyArray<AddSkillOperation>, lockfile: Lockfile, name: string, description: Option<string>) => Plan<AddSkillOperation>`

**Pure function** — no Effect needed. The comparison logic is synchronous: check if `op.skill.name` exists as a key in `lockfile.skills`. If present → `no-op` with reason "already installed". If absent → `execute`. The `name` and `description` are passed through to the returned plan — the caller (handler) is responsible for constructing them.

**Label derivation**: Use `op.skill.name` as the action label.

**Why not shared**: Each extension type has different criteria for determining execute vs no-op. Skills check the lockfile by name. Commands might check file existence. The build logic is inherently extension-specific.

### 4. Handler confirmation flow

After display, the handler checks:

1. If `--dry-run` → exit after display
2. If `--yes` → apply immediately
3. Otherwise → `clack.confirm()` → apply or exit

The handler calls skills-specific `buildPlan` → shared `displayPlan` → confirm logic → shared `applyPlan`. The handler's existing inline `_plan` sketch code and TODO comments are replaced by calls to the new modules. The `_lockfile`/`_settings` bindings are replaced with a `lockfile` binding that feeds into `buildPlan`.

### 5. Skill operation types in skills command directory

Move `AddSkillOperation`, `RemoveSkillOperation`, and `SkillRef` from their current locations to `cli-commands/skills/operations.ts`. Delete `WorkspaceOperation` union — it's meaningless once operations are feature-scoped. `SkillRef` is lifted from `install/discover-skills.ts` to the skills level since it will be useful across skill operations (install, uninstall, etc.), not just install.

**Rationale**: Placing skill operations and types at the skills command level lets both install and uninstall import them. `SkillRef` describes a reference to a discovered skill — a concept relevant to all skill operations.

### 6. Delete `workspace/ideal-state.ts`

The file is a holdover from the ideal-state reconciliation architecture that was never implemented. Its contents are redistributed: plan types → `workspace/plan.ts`, operation types → `cli-commands/skills/operations.ts`.

**Rationale**: The ideal-state pattern added indirection without value for install. Operations + lockfile → plan is more direct. If ideal-state is needed for a future reconciliation pattern, it can be re-introduced then.

## Risks / Trade-offs

**No-op check is name-only** → A skill in the lockfile from a different source still produces `no-op`. This is intentional (force reinstall is out of scope) but means users can't switch sources without manually editing the lockfile until force is implemented.

**Stub apply gives false confidence** → Users see "installed" messages but nothing actually happens on disk. Mitigation: the `clack.outro` summary should make it clear this is the current behavior, and the next change will implement real apply.

**Shared modules have one consumer initially** → `displayPlan` and `applyPlan` are shared from the start but only used by skills install today. This is a small upfront cost that avoids a restructuring change when the next consumer arrives. The generic signatures ensure these modules are genuinely reusable, not prematurely abstracted.
