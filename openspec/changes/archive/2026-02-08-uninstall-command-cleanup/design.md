## Context

The uninstall executor (`uninstall-skill.ts`) uses broad `catchAll` handlers that mask legitimate errors. The lockfile module already provides typed errors (`LockfileNotFoundError`, `LockfileParseError`, `LockfileWriteError`) — the executor just ignores all of them. The remaining changes are mechanical convention fixes (type renames, removing redundant assertions).

## Goals / Non-Goals

**Goals:**

- Narrow error recovery in the executor to only handle expected, recoverable cases
- Let lockfile write errors propagate so partial uninstall doesn't leave inconsistent state
- Align type naming and code style with project conventions

**Non-Goals:**

- Changing the executor's overall architecture or pipeline
- Modifying lockfile module error types
- Changing behavior for file-on-disk operations (symlink/directory removal) — those `catchAll` handlers are correct per spec

## Decisions

### D1: Narrow `getLockfile()` catch in executor to `LockfileNotFoundError` only

The executor re-reads the lockfile to get the agent list. Currently `catchAll` replaces any error with an empty lockfile. This masks corrupt lockfile errors.

**Approach**: Replace `catchAll` with `catchTag("LockfileNotFoundError", ...)` so only missing lockfile falls back to empty. `LockfileParseError` propagates — a corrupt lockfile is a real problem the user should see.

**Alternative considered**: Remove the second lockfile read entirely and pass lockfile data through the operation args. Rejected — would require changing the `OperationHandler` interface and `UninstallSkillOperation` type, which is out of scope for a cleanup change.

### D2: Let `updateLockEntry` errors propagate during partial uninstall

Currently `updateLockEntry` failures are swallowed with `catchAll(() => Effect.void)`. This means agent symlinks get removed but the lockfile still lists them — inconsistent state.

**Approach**: Remove the `catchAll` on `updateLockEntry`. Let `LockfileError` propagate to the caller. The plan apply infrastructure already handles step failures.

**Alternative considered**: Log a warning but continue. Rejected — a lockfile write failure leaves state inconsistent regardless. Better to fail the step clearly so the user knows something went wrong.

### D3: Also let `removeLockEntry` errors propagate during full uninstall

Same reasoning as D2 — `removeLockEntry` failures currently swallowed. Canonical dir is already deleted but lockfile still references the skill.

**Approach**: Remove the `catchAll` on `removeLockEntry`. Let it propagate.

### D4: Convention fixes are mechanical

- Rename `UninstallArgs` → `UninstallCommandArgs` in `command.ts`, `UninstallArgs` → `UninstallHandlerArgs` in `handler.ts`
- Remove `as const` on `"PlannedJobStep"`, `"success"`, `"no-op"` literals in `build-plan.ts` — already narrowed by `satisfies`
- Remove explicit `ReadonlyArray<UninstallSkillOperation>` type annotation on `ops` in `handler.ts`

No design decisions needed — these are direct applications of CLAUDE.md conventions.

## Risks / Trade-offs

**[Risk] Lockfile error propagation changes executor error channel** → The `uninstallSkill` handler's Effect error type will include `LockfileError`. Callers (plan apply infrastructure) must handle this. Since `OperationHandler` returns `OperationResult`, the error will be caught by the plan executor and reported as a step failure — this is the desired behavior.

**[Risk] Narrowing `getLockfile()` catch may surface errors that were previously hidden** → This is intentional. A corrupt lockfile should not silently produce "not installed" results. Users will see a clear error instead of confusing no-op behavior.
