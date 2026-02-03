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

// Handler decides how to handle divergence
const { issues } = yield * ws.diagnoseSkills(actual, locked);
if (issues.some((i) => i.critical) && !force) {
  return yield * Effect.fail(new UnhealthyWorkspaceError({ issues }));
}

const ideal =
  yield *
  ws.buildIdealState(locked, {
    _tag: "skills-install",
    source: "owner/repo",
    agents: ["claude"],
    skills: ["my-skill"], // or "all"
    force: false,
  });
const plan = yield * ws.buildPlan(actual, locked, ideal);
yield * plan.apply({ dryRun });

return plan;
```

## Design Decisions

| Decision            | Choice              | Rationale                               |
| ------------------- | ------------------- | --------------------------------------- |
| Command encoding    | Discriminated union | Simple, explicit, type-safe             |
| Plan execution      | `plan.apply()`      | Single method handles dry-run and apply |
| State separation    | Actual/Locked/Ideal | Clear mental model, distinct concerns   |
| Divergence handling | Handler diagnoses   | Explicit control per command            |
| Multiple targets    | Bulk via args       | Commands use arrays (skills, agents)    |
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

  /** Compute ideal state for a command based on current locked state */
  buildIdealState(
    locked: LockedState,
    cmd: Command,
  ): Effect.Effect<IdealState, CommandError>;

  /** Diff current state vs ideal to produce execution plan */
  buildPlan(
    actual: ActualState,
    locked: LockedState,
    ideal: IdealState,
  ): Effect.Effect<Plan, PlanError>;

  /** Diagnose skill inconsistencies between actual and locked state */
  diagnoseSkills(
    actual: ActualState,
    locked: LockedState,
  ): Effect.Effect<SkillsDiagnosis, DiagnoseError>;
}

/** Layer factory - creates Workspace bound to a specific path */
const WorkspaceLive = (options: { global: boolean }) =>
  Layer.succeed(
    Workspace,
    makeWorkspace(options.global ? globalAxmPath() : localAxmPath()),
  );
```

## Commands

Discriminated union of all supported commands:

```typescript
type Command =
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

/** Desired outcome - what we want after the command */
interface IdealState {
  skills: Map<string, InstalledSkill>;
  settings: Settings; // desired configuration
}
```

## Plan

```typescript
interface Plan {
  readonly steps: ReadonlyArray<PlanStep>;

  /** Apply plan: display if dryRun, execute otherwise */
  apply(opts: { dryRun: boolean }): Effect.Effect<void, ApplyError>;
}

type PlanStep =
  | { _tag: "AddSkill"; skill: string; source: string }
  | { _tag: "RemoveSkill"; skill: string }
  | { _tag: "SyncSkill"; skill: string; agent: string }
  | { _tag: "CleanSkill"; skill: string; agent: string };
```

## SkillsDiagnosis

```typescript
interface SkillsDiagnosis {
  readonly issues: ReadonlyArray<SkillIssue>;
  readonly prescriptionPlan: Plan; // repairs for issues

  /** Display issues only (axm doctor) */
  displayIssues(): Effect.Effect<void, DisplayError>;
}

type SkillIssue =
  | { _tag: "SkillMissingFromDisk"; name: string; critical: boolean }
  | {
      _tag: "SkillNotInLockfile";
      name: string;
      path: string;
      critical: boolean;
    }
  | {
      _tag: "ChecksumMismatch";
      name: string;
      expected: string;
      actual: string;
      critical: boolean;
    }
  | {
      _tag: "OrphanedSettingsRef";
      agent: string;
      skill: string;
      critical: boolean;
    };
```

## Doctor Pattern

```typescript
// axm doctor [--fix] [--dry-run]
const ws = yield * Workspace;
yield * ws.ensureInit();

const actual = yield * ws.loadActual();
const locked = yield * ws.loadLocked();
const diagnosis = yield * ws.diagnoseSkills(actual, locked);

if (!fix) {
  yield * diagnosis.displayIssues();
} else {
  yield * diagnosis.prescriptionPlan.apply({ dryRun });
}

return diagnosis;
```

## Benefits

1. **Testable** - Plans can be built and inspected without execution
2. **Inspectable** - Plans returned from handlers for logging/debugging
3. **Composable** - Same pattern for all commands
4. **Dry-run trivial** - Single `apply({ dryRun })` handles both modes

## Open Questions

- [ ] How to handle external state (remote skill registries)?
- [ ] Should `buildPlan` detect no-op and return empty plan?
- [ ] Error recovery: partial apply rollback?
