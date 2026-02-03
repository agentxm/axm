# Dry Run v2: Desired-State Reconciliation

## Overview

Refactor dry-run support using a desired-state reconciliation pattern. Handlers compute ideal state, diff against actual, and either display or apply the resulting plan.

## Core Pattern

```typescript
// Workspace context (local vs global) determined at service creation
const ws = yield * Workspace;

yield * ws.ensureInit();
const actual = yield * ws.loadActual();
const locked = yield * ws.loadLocked();
const ideal =
  yield *
  ws.buildIdealState({
    _tag: "skills-install",
    source: "owner/repo",
    agents: ["claude"],
    skills: ["my-skill"], // or "all"
    force: false,
  });
const plan = yield * ws.buildPlan(actual, locked, ideal);
yield * plan.execute({ dryRun });

return plan;
```

## Design Decisions

| Decision            | Choice              | Rationale                               |
| ------------------- | ------------------- | --------------------------------------- |
| Operation encoding  | Discriminated union | Simple, explicit, type-safe             |
| Plan execution      | `plan.execute()`    | Single method handles dry-run and apply |
| State separation    | Actual/Locked/Ideal | Clear mental model, distinct concerns   |
| Multiple operations | Bulk via args       | Operations use arrays (skills, agents)  |
| Apply effectful     | Yes                 | Side effects require Effect             |

## Workspace Service

```typescript
interface Workspace {
  /** Workspace root path (e.g., .axm/ or ~/.axm/) */
  readonly path: string;

  /** Ensure workspace is initialized (create .axm/ if needed) */
  ensureInit(): Effect.Effect<void, WorkspaceError>;

  /** Load filesystem state - what's physically on disk */
  loadActual(): Effect.Effect<ActualState, WorkspaceError>;

  /** Load lockfile state - what we expect to be installed */
  loadLocked(): Effect.Effect<LockedState, WorkspaceError>;

  /** Compute ideal state for an operation */
  buildIdealState(op: Operation): Effect.Effect<IdealState, OperationError>;

  /** Diff current state vs ideal to produce execution plan */
  buildPlan(
    actual: ActualState,
    locked: LockedState,
    ideal: IdealState,
  ): Effect.Effect<Plan, PlanError>;

  /** Diagnose inconsistencies between actual and locked state */
  diagnose(
    actual: ActualState,
    locked: LockedState,
  ): Effect.Effect<DiagnosticResult, DiagnoseError>;
}

/** Layer factory - creates Workspace bound to a specific path */
const WorkspaceLive = (options: { global: boolean }) =>
  Layer.succeed(
    Workspace,
    makeWorkspace(options.global ? globalAxmPath() : localAxmPath()),
  );
```

## Operations

Discriminated union of all supported operations:

```typescript
type Operation =
  | {
      _tag: "skills-install";
      /** GitHub shorthand (owner/repo), local path, or URL */
      source: string;
      /** Install only to specified agent(s); empty = all agents */
      agents: string[];
      /** "all" to install all discovered skills, or specific skill names */
      skills: "all" | string[];
      /** Overwrite existing skills */
      force: boolean;
    }
  | {
      _tag: "skills-uninstall";
      /** Skill names to uninstall */
      skills: string[];
    }
  | {
      _tag: "skills-update";
      /** Skill names to update; empty = all installed skills */
      skills: string[];
    };
```

## State Types

```typescript
/** Filesystem reality - what's physically on disk */
interface ActualState {
  skills: Map<string, SkillOnDisk>;
}

/** Lockfile contract - what we've committed to having installed */
interface LockedState {
  entries: Map<string, LockfileEntry>;
}

/** Desired outcome - what we want after the operation */
interface IdealState {
  skills: Map<string, InstalledSkill>;
  settings: Settings; // desired configuration
}
```

## Plan

```typescript
interface Plan {
  readonly steps: ReadonlyArray<PlanStep>;

  /** Execute plan: display if dryRun, apply otherwise */
  execute(opts: { dryRun: boolean }): Effect.Effect<void, ExecuteError>;
}

type PlanStep =
  | { _tag: "CreateFile"; path: string; content: string }
  | { _tag: "UpdateFile"; path: string; content: string }
  | { _tag: "DeleteFile"; path: string }
  | { _tag: "CreateDirectory"; path: string };
```

## DiagnosticResult

```typescript
interface DiagnosticResult {
  readonly issues: ReadonlyArray<Issue>;
  readonly plan: Plan; // repairs for issues

  /** Display issues only (axm doctor) */
  displayIssues(): Effect.Effect<void, DisplayError>;
}

type Issue =
  | { _tag: "SkillMissingFromDisk"; name: string }
  | { _tag: "SkillNotInLockfile"; name: string; path: string }
  | { _tag: "ChecksumMismatch"; name: string; expected: string; actual: string }
  | { _tag: "OrphanedSettingsRef"; agent: string; skill: string };
```

## Doctor Pattern

```typescript
// axm doctor [--fix] [--dry-run]
const ws = yield * Workspace;
yield * ws.ensureInit();

const actual = yield * ws.loadActual();
const locked = yield * ws.loadLocked();
const result = yield * ws.diagnose(actual, locked);

if (!fix) {
  yield * result.displayIssues();
} else {
  yield * result.plan.execute({ dryRun });
}

return result;
```

## Benefits

1. **Testable** - Plans can be built and inspected without execution
2. **Inspectable** - Plans returned from handlers for logging/debugging
3. **Composable** - Same pattern for all operations
4. **Dry-run trivial** - Single `execute({ dryRun })` handles both modes

## Open Questions

- [ ] How to handle external state (remote skill registries)?
- [ ] Should `buildPlan` detect no-op and return empty plan?
- [ ] Error recovery: partial apply rollback?
