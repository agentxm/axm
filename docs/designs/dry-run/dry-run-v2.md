# Dry Run v2: Desired-State Reconciliation

## Overview

Refactor dry-run support using a desired-state reconciliation pattern. Handlers compute ideal state, diff against actual, and either display or apply the resulting plan.

## Core Pattern

```typescript
const ws = yield * Workspace;

const actual = yield * ws.loadActual();
const ideal = yield * ws.buildIdealState({ installSkill: { name, source } });
const plan = ws.buildPlan(actual, ideal);

if (dryRun) {
  yield * plan.display();
} else {
  yield * plan.apply();
}
```

## Design Decisions

| Decision            | Choice              | Rationale                               |
| ------------------- | ------------------- | --------------------------------------- |
| Operation encoding  | Discriminated union | Simple, explicit, type-safe             |
| Plan presentation   | `plan.display()`    | Keeps Workspace focused on state        |
| State scope         | Total state         | Cleaner diffing, single source of truth |
| Multiple operations | Bulk via args       | Single operation, extend args for bulk  |
| Apply effectful     | Yes                 | Side effects require Effect             |

## Workspace Service

```typescript
interface Workspace {
  /** Load current workspace state from disk */
  loadActual(): Effect.Effect<WorkspaceState, WorkspaceError>;

  /** Compute ideal state for an operation */
  buildIdealState(op: Operation): Effect.Effect<WorkspaceState, OperationError>;

  /** Pure diff: compute steps to go from actual to ideal */
  buildPlan(actual: WorkspaceState, ideal: WorkspaceState): Plan;
}
```

## Operations

Discriminated union of all supported operations:

```typescript
type Operation =
  | { _tag: "InstallSkill"; name: string; source: SkillSource }
  | { _tag: "UninstallSkill"; name: string }
  | { _tag: "UpdateSkill"; name: string }
  // Future: bulk variants via array args
  | {
      _tag: "InstallSkills";
      skills: Array<{ name: string; source: SkillSource }>;
    };
```

## WorkspaceState

Total state representation:

```typescript
interface WorkspaceState {
  skills: Map<string, InstalledSkill>;
  settings: Settings;
  // Future: other workspace concerns
}
```

## Plan

```typescript
interface Plan {
  readonly steps: ReadonlyArray<PlanStep>;

  /** Display plan to user (dry-run output) */
  display(): Effect.Effect<void, DisplayError>;

  /** Execute all steps */
  apply(): Effect.Effect<void, ApplyError>;
}

type PlanStep =
  | { _tag: "CreateFile"; path: string; content: string }
  | { _tag: "UpdateFile"; path: string; content: string }
  | { _tag: "DeleteFile"; path: string }
  | { _tag: "CreateDirectory"; path: string };
```

## Benefits

1. **Testable** - `buildPlan` is pure, test with fixtures
2. **Inspectable** - Plans can be serialized, logged, reviewed
3. **Composable** - Same pattern for all operations
4. **Dry-run trivial** - Just call `display()` instead of `apply()`

## Open Questions

- [ ] How to handle external state (remote skill registries)?
- [ ] Should `buildPlan` detect no-op and return empty plan?
- [ ] Error recovery: partial apply rollback?
