# Dry Run v2: Desired-State Reconciliation

## Overview

Refactor dry-run support using a desired-state reconciliation pattern. Handlers compute ideal state, diff against actual, and either display or apply the resulting plan.

## Core Pattern

```typescript
// Workspace context (local vs global) determined at service creation
const ws = yield * Workspace;

const actual = yield * ws.loadActual();
const ideal =
  yield *
  ws.buildIdealState({
    _tag: "skills-install",
    source: "owner/repo",
    agents: ["claude"],
    skills: ["my-skill"], // or "all"
    force: false,
  });
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
| Multiple operations | Bulk via args       | Operations use arrays (skills, agents)  |
| Apply effectful     | Yes                 | Side effects require Effect             |

## Workspace Service

```typescript
interface Workspace {
  /** Workspace root path (e.g., .axm/ or ~/.axm/) */
  readonly path: string;

  /** Load current workspace state from disk */
  loadActual(): Effect.Effect<WorkspaceState, WorkspaceError>;

  /** Compute ideal state for an operation */
  buildIdealState(op: Operation): Effect.Effect<WorkspaceState, OperationError>;

  /** Pure diff: compute steps to go from actual to ideal */
  buildPlan(actual: WorkspaceState, ideal: WorkspaceState): Plan;
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
