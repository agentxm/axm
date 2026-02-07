## Context

The install handler currently:

1. Parses source, discovers skills, selects skills
2. Builds `AddSkillOperation[]` from selections
3. Reads lockfile and settings from workspace
4. Constructs a `Plan` inline with hardcoded `action: "execute"` for every operation
5. Stops — no display, no confirmation, no execution

The `Plan`, `Action`, `Job` types exist in `workspace/ideal-state.ts`. The lockfile module has full read/write/update support. The workspace service exposes `path`, `getSettings()`, and `getLockfile()`. No `apply`, `load-state`, or `buildIdealState` modules exist yet.

The existing spec (`cli-skills-install`) references `loadCurrentState`, `buildIdealState`, and `applyPlan` as workspace-level modules. This design scopes the work to the install command feature folder instead — plan build, display, and apply are install-specific, not workspace-generic. If other commands (uninstall, update) need similar patterns later, we extract then.

## Goals / Non-Goals

**Goals:**

- Build a plan that compares operations against lockfile state (already-installed → no-op, new → execute, force → execute)
- Display the plan as a human-readable summary via Clack
- Respect `--dry-run` (display only) and `--yes` (skip confirmation)
- Execute the plan: copy skill files to the workspace and update the lockfile
- Clean up the handler by replacing inline plan construction and TODOs with module calls

**Non-Goals:**

- Generic workspace-level `buildIdealState` / `applyPlan` abstractions — keep it in the install feature folder
- `buildIdealFromOperations` fold pattern — the plan builder directly diffs ops vs lockfile
- `RemoveSkillOperation` handling (that's the uninstall command)
- Agent selection from settings (separate TODO, out of scope — agentIds stays as-is for now)
- Rollback or partial failure recovery — if one skill fails, the rest still apply, errors are collected

## Decisions

### 1. Plan builder lives in `install/build-plan.ts`

The plan builder takes `AddSkillOperation[]` and the current `Lockfile`, returns a `Plan`. Each operation is compared against the lockfile by skill name:

- Not in lockfile → `action: "execute"`, `reason: None`
- In lockfile, same source → `action: "no-op"`, `reason: Some("already installed")`
- In lockfile, different source → `action: "no-op"`, `reason: Some("already installed from different source")` (unless `force`)
- In lockfile + `force` → `action: "execute"`, `reason: Some("force reinstall")`

**Why not workspace-level?** Only install needs this today. YAGNI.

**Alternative considered:** `buildIdealState` fold pattern from existing spec. Rejected because it introduces `IdealState`/`CurrentState` types that aren't needed — the lockfile _is_ the current state, and the plan _is_ the diff. Adding an intermediate representation adds complexity without value for install.

### 2. Plan display lives in `install/display-plan.ts`

Takes a `Plan` and renders it via Clack:

- Groups actions by type (execute vs no-op)
- Shows skill name + reason for each
- Summary line: "N skill(s) to install, M already installed"

Pure rendering — no side effects beyond Clack output.

### 3. Plan apply lives in `install/apply-plan.ts`

Takes a `Plan` and workspace context, executes `execute` actions concurrently:

1. For each `execute` action, copy skill directory to each agent's skills dir
2. Update lockfile with new entries (using `updateLockEntry`)
3. Report results via Clack spinner

The copy source is `SkillRef.path` (always populated after discovery — local paths are literal, remote paths point to temp clone dir kept alive by `Effect.scoped`).

**Source-to-lock-entry conversion:** A helper maps `AddSkillOperation` + `SkillRef` → `SkillLockEntry` for the lockfile, preserving the full source variant.

### 4. Handler orchestration

After skill selection, the handler calls:

```
buildPlan(ops, lockfile) → displayPlan(plan) → [confirm if needed] → applyPlan(plan, ws)
```

Flow control:

- `--dry-run` → display plan, stop
- `--yes` → display plan, apply without confirmation
- Default → display plan, confirm prompt, apply if confirmed

### 5. Plan types stay in `workspace/ideal-state.ts`

The existing `Plan`, `Action`, `Job` types are fine. No changes needed — they already support `execute | no-op | error` actions with optional reasons. The `error` action type is unused for now but harmless.

## Risks / Trade-offs

- **Concurrent lockfile writes** → Each `updateLockEntry` reads-then-writes the lockfile. With concurrent skill installs, this could cause lost updates. **Mitigation:** Collect all lock entries in memory first, then write the full lockfile once at the end using `writeLockfile`.
- **Temp clone dir lifetime** → Remote source skill files live in a temp dir managed by `Effect.scoped`. The apply step must complete before the scope closes. **Mitigation:** The handler already wraps everything in `Effect.scoped` — apply runs inside it.
- **No rollback** → If copying skill 3 of 5 fails, skills 1-2 are already on disk and in the lockfile. **Mitigation:** Acceptable for v1. Each skill install is independent. Log failures, continue with remaining skills.
