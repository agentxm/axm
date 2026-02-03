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

| Decision            | Choice                     | Rationale                                                  |
| ------------------- | -------------------------- | ---------------------------------------------------------- |
| Command encoding    | Discriminated union        | Simple, explicit, type-safe                                |
| Plan execution      | `plan.apply()`             | Single method handles dry-run and apply                    |
| State separation    | Actual/Locked/Ideal        | Clear mental model, distinct concerns                      |
| State types         | Shared for Actual & Ideal  | Diff is set operations; same structure                     |
| Install location    | Canonical by source type   | Registry: `@<scope>/skills/`, external: `external/skills/` |
| Agent sync          | All by default, filterable | Sync to project agents; `--agent` to filter                |
| Plan steps          | User intent, not impl      | Show install/update/remove, hide clean+add                 |
| Agent grouping      | Per-skill with agents[]    | Matches display: "skill @ agent1, agent2"                  |
| Divergence handling | Handler diagnoses          | Explicit control per command                               |
| Diagnosis decoupled | Issues only, no plan       | Separation of concerns; plan built if needed               |
| Settings changes    | Derived, not explicit      | Encapsulated in skill operations                           |
| Multiple targets    | Bulk via args              | Commands use arrays (skills, agents)                       |
| Apply effectful     | Yes                        | Side effects require Effect                                |

## Workspace Service

```typescript
interface Workspace {
  /** Workspace root path (e.g., .axm/ or ~/.axm/) */
  readonly path: string;

  /** Whether user prompts are allowed */
  readonly interactive: boolean;

  /**
   * Ensure workspace is initialized.
   * If interactive and not initialized, walks user through setup.
   * If non-interactive and not initialized, fails with WorkspaceNotInitialized.
   */
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

  /** Build ideal state to repair diagnosed issues (for doctor --fix) */
  buildIdealFromDiagnosis(
    locked: LockedState,
    diagnosis: SkillsDiagnosis,
  ): Effect.Effect<IdealState, CommandError>;
}

/** Layer factory - creates Workspace with context */
const WorkspaceLive = (options: { global: boolean; interactive: boolean }) =>
  Layer.succeed(
    Workspace,
    makeWorkspace({
      path: options.global ? globalAxmPath() : localAxmPath(),
      interactive: options.interactive,
    }),
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
      /** Limit sync to these agents; empty = all agents from project settings */
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
/** Skill in the workspace (canonical or agent-synced location) */
interface WorkspaceSkill {
  name: string;
  /** Where found: undefined = canonical (.axm/extensions/...), string = agent directory */
  agent?: string;
  path: string;
  files: ReadonlyArray<string>;
}

/** Filesystem reality - what's physically on disk */
interface ActualState {
  skills: ReadonlyArray<WorkspaceSkill>;
}

/** Lockfile contract - what we've committed to having installed */
type LockedState = Lockfile; // from @agentxm/core/experimental/schemas/lockfile

/** Desired outcome - what we want after the command */
interface IdealState {
  skills: ReadonlyArray<WorkspaceSkill>;
}
```

**Installation model:**

- Registry skills install to `.axm/extensions/@<scope>/skills/<name>`
- External skills (GitHub, local) install to `.axm/extensions/external/skills/<name>`
- Sync to agents defined in project settings (filtered by `--agent` if specified)
- ActualState scans both canonical and agent directories

**Plan computation** (diff of actual vs ideal):

- In ideal but not actual → install
- In actual but not ideal → remove
- In both → no-op

## Plan

Plan steps reflect user intent, not implementation details. Each step groups affected agents.

```typescript
interface Plan {
  readonly steps: ReadonlyArray<PlanStep>;

  /** Apply plan: display if dryRun, execute otherwise */
  apply(opts: { dryRun: boolean }): Effect.Effect<void, ApplyError>;
}

/** Steps reflect user intent, grouped by skill */
type PlanStep =
  | {
      _tag: "InstallSkill";
      skill: string;
      /** Agents to sync to (resolved from settings + filter) */
      agents: ReadonlyArray<string>;
      source: string;
    }
  | { _tag: "UpdateSkill"; skill: string; agents: ReadonlyArray<string> }
  | { _tag: "RemoveSkill"; skill: string; agents: ReadonlyArray<string> }
  | { _tag: "RepairSkill"; skill: string; agents: ReadonlyArray<string> };
```

Example output:

```
axm skills install github:org/repo --all

  (install) commit @ claude, cursor, codex
  (install) review-pr @ claude, cursor, codex

  2 skills to install across 3 agents
```

```
axm skills install github:org/repo --all --agent claude

  (install) commit @ claude
  (install) review-pr @ claude

  2 skills to install
```

```
axm skills update my-skill

  (update) my-skill @ claude, codex, gemini

  1 skill to update
```

Implementation details (e.g., update = clean + add) are hidden inside `plan.apply()`.

## SkillsDiagnosis

Diagnosis is decoupled from planning. Issues are identified; repair plan is built separately if needed.

```typescript
interface SkillsDiagnosis {
  readonly issues: ReadonlyArray<SkillIssue>;
}

type SkillIssue =
  | {
      _tag: "SkillMissingFromDisk";
      name: string;
      agent?: string;
      critical: boolean;
    }
  | {
      _tag: "SkillNotInLockfile";
      name: string;
      agent?: string;
      critical: boolean;
    }
  | {
      _tag: "ChecksumMismatch";
      name: string;
      agent?: string;
      expected: string;
      actual: string;
      critical: boolean;
    }
  | {
      _tag: "OrphanedSettingsRef";
      agent?: string;
      skill: string;
      critical: boolean;
    };
```

Note: Issue types need further refinement to align with validation codes (see sketch doc).

## Doctor Pattern

```typescript
// axm doctor [--fix] [--dry-run]
const ws = yield * Workspace;
yield * ws.ensureInit();

const actual = yield * ws.loadActual();
const locked = yield * ws.loadLocked();
const diagnosis = yield * ws.diagnoseSkills(actual, locked);

if (!fix) {
  // Display issues only
  yield * displayIssues(diagnosis.issues);
  return diagnosis;
}

// Build repair plan from issues
const ideal = yield * ws.buildIdealFromDiagnosis(locked, diagnosis);
const plan = yield * ws.buildPlan(actual, locked, ideal);
yield * plan.apply({ dryRun });

return diagnosis;
```

Example output:

```
axm doctor --fix

  (repair) broken-skill @ claude
  (remove) orphaned-skill @ cursor

  1 to repair, 1 to remove
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
- [ ] SkillIssue types need refinement to align with validation codes (see sketch doc)
