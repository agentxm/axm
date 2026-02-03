# Dry Run v2: Desired-State Reconciliation

## Overview

Refactor dry-run support using a desired-state reconciliation pattern. Handlers compute ideal state, diff against actual, and either display or apply the resulting plan.

## Core Pattern

```typescript
// Workspace context (local vs global) determined at service creation
const ws = yield * Workspace;

yield * ws.ensureInit();
const current = yield * ws.loadCurrentState();

// Handler decides how to handle divergence
const { issues } = yield * ws.diagnose(current);
if (issues.some((i) => i.severity === "error") && !force) {
  return yield * Effect.fail(new UnhealthyWorkspaceError({ issues }));
}

const ideal =
  yield *
  ws.buildIdealState(current, {
    _tag: "skills-install",
    source: "owner/repo",
    agents: ["claude"],
    skills: ["my-skill"], // or "all"
    force: false,
  });
const plan = yield * ws.buildPlan(current, ideal);
yield * ws.applyPlan(plan, { dryRun });

return plan;
```

## Design Decisions

| Decision            | Choice                        | Rationale                                                           |
| ------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Command encoding    | Discriminated union           | Simple, explicit, type-safe                                         |
| Plan execution      | `ws.applyPlan(plan, opts)`    | Separate data from behavior; easier to test                         |
| State separation    | Actual/Ideal (distinct types) | Different shapes: actual has path/files, ideal has source           |
| Current state       | Merged actual + locked        | Single object for diffing; locked consumed early                    |
| Diffing             | Version or hash by source     | Registry: semver; Git: tree hash; Local: always update              |
| Integrity checks    | Existence only, no content    | Avoid false positives from formatting changes                       |
| Install location    | Canonical by source type      | Registry: `@<scope>/skills/<name>`, other: `external/skills/<name>` |
| Agent sync          | Separate concern              | Computed independently; not part of skill state                     |
| Plan steps          | User intent, not impl         | Show install/update/remove, hide clean+add                          |
| Agent grouping      | Per-skill with agents[]       | Matches display: "skill @ agent1, agent2"                           |
| Divergence handling | Handler diagnoses             | Explicit control per command                                        |
| Diagnosis decoupled | Issues only, no plan          | Separation of concerns; plan built if needed                        |
| Settings changes    | Derived, not explicit         | Encapsulated in skill operations                                    |
| Multiple targets    | Bulk via args                 | Commands use arrays (skills, agents)                                |
| Apply effectful     | Yes                           | Side effects require Effect                                         |

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

  /** Load current state - merges actual (disk) with locked (lockfile) */
  loadCurrentState(): Effect.Effect<CurrentState, WorkspaceError>;

  /** Compute ideal state for a command based on current state */
  buildIdealState(
    current: CurrentState,
    cmd: Command,
  ): Effect.Effect<IdealState, CommandError>;

  /** Diff current state vs ideal to produce execution plan */
  buildPlan(
    current: CurrentState,
    ideal: IdealState,
  ): Effect.Effect<Plan, PlanError>;

  /** Apply a plan - display if dryRun, execute otherwise */
  applyPlan(
    plan: Plan,
    opts: { dryRun: boolean },
  ): Effect.Effect<ApplyResult, ApplyError>;

  /** Diagnose workspace inconsistencies */
  diagnose(current: CurrentState): Effect.Effect<Diagnosis, DiagnoseError>;

  /** Build ideal state to repair diagnosed issues (for doctor --fix) */
  buildIdealFromDiagnosis(
    current: CurrentState,
    diagnosis: Diagnosis,
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
import { Array, Option } from "effect";

/** Skill source - where to fetch from */
type SkillSource =
  | {
      _tag: "Registry";
      origin: string;
      scope: string;
      name: string;
      version: string;
    }
  | { _tag: "GitHub"; owner: string; repo: string; ref?: string; path?: string }
  | { _tag: "Local"; path: string };

/** Skill as it exists on disk */
interface ActualSkill {
  name: string;
  path: string;
  files: Array.Array<string>;
  frontmatter: Option<SkillFrontmatter>;
}

/** Skill entry from lockfile */
interface LockedSkill {
  name: string;
  source: SkillSource;
  version: Option<string>; // Semver for registry, None for git/local
  gitTreeHash: Option<string>; // Hash of source folder for git sources
  installedAt: Date;
  updatedAt: Date;
}

/** Combined state for a skill - actual + locked merged */
interface SkillState {
  name: string;
  actual: Option<ActualSkill>; // None = not on disk
  locked: Option<LockedSkill>; // None = not in lockfile
}

/** Current workspace state - all skills with their actual/locked status */
interface CurrentState {
  skills: Array.Array<SkillState>;
}

/** Desired skill after the command */
interface IdealSkill {
  name: string;
  path: string; // Install path (identity, derived from source)
  source: SkillSource;
  version: Option<string>; // Semver for registry, None for git/local
  gitTreeHash: Option<string>; // Hash of source folder for git sources
  agents: Array.Array<string>; // Which agents to sync to
}

/** Desired outcome - what we want after the command */
interface IdealState {
  skills: Array.Array<IdealSkill>;
}
```

**Installation model:**

- Registry skills install to `.axm/extensions/@<scope>/skills/<name>`
- External skills (GitHub, local) install to `.axm/extensions/external/skills/<name>`
- Sync to agents defined in project settings (filtered by `--agent` if specified)

**Plan computation** (diff of current vs ideal, matched by path):

- In ideal but not current → install
- In current but not ideal → remove
- In both, version or hash differs → update
- In both, same version/hash → no-op

**Skill identity**: install path (derived from source type + name)

- Registry `@scope/skill` → `.axm/extensions/@scope/skills/skill`
- External (GitHub, Local, etc.) → `.axm/extensions/external/skills/skill`
- Registry and external skills with same name coexist (different paths)

**Update detection** (version or hash, depending on source type):

- Registry sources: compare `version`
- Git sources: compare `gitTreeHash`
- Local sources: always update (no stable identifier)

## Plan

Plan is pure data - steps reflecting user intent. Execution is handled by `ws.applyPlan()`.

```typescript
/** Plan is pure data - no behavior */
interface Plan {
  readonly steps: Array.Array<PlanStep>;
}

/** Steps reflect user intent, grouped by skill */
type PlanStep =
  | {
      _tag: "InstallSkill";
      skill: string;
      path: string; // Computed install path
      source: SkillSource;
      version: Option<string>;
      gitTreeHash: Option<string>;
      agents: Array.Array<string>;
    }
  | {
      _tag: "UpdateSkill";
      skill: string;
      path: string;
      fromVersion: Option<string>;
      toVersion: Option<string>;
      fromHash: Option<string>; // For git sources without version
      toHash: Option<string>;
      agents: Array.Array<string>;
    }
  | {
      _tag: "RemoveSkill";
      skill: string;
      path: string;
      agents: Array.Array<string>;
    }
  | {
      _tag: "RepairSkill";
      skill: string;
      path: string;
      agents: Array.Array<string>;
    };

/** Result of applying a plan */
interface ApplyResult {
  applied: Array.Array<PlanStep>;
  failed: Array.Array<{ step: PlanStep; error: ApplyError }>;
}
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

## Diagnosis

Diagnosis is decoupled from planning. Issues are identified from current state; repair plan is built separately if needed.

```typescript
interface Diagnosis {
  readonly issues: Array.Array<Issue>;
}

/** Issue severity - derived from issue type */
type Severity = "error" | "warning";

type Issue =
  | {
      _tag: "SkillMissingFromDisk";
      name: string;
      severity: "error";
    }
  | {
      _tag: "SkillNotInLockfile";
      name: string;
      severity: "warning"; // Orphaned skill - cleanup candidate
    }
  | {
      _tag: "OrphanedSettingsRef";
      agent: string;
      skill: string;
      severity: "warning";
    }
  | {
      _tag: "MissingSkillMd";
      name: string;
      severity: "error";
    };
```

Note: No checksum/hash-based issues - we use version-based diffing only.

## Doctor Pattern

```typescript
// axm doctor [--fix] [--dry-run]
const ws = yield * Workspace;
yield * ws.ensureInit();

const current = yield * ws.loadCurrentState();
const diagnosis = yield * ws.diagnose(current);

if (!fix) {
  // Display issues only
  yield * displayIssues(diagnosis.issues);
  return diagnosis;
}

// Build repair plan from issues
const ideal = yield * ws.buildIdealFromDiagnosis(current, diagnosis);
const plan = yield * ws.buildPlan(current, ideal);
yield * ws.applyPlan(plan, { dryRun });

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

## Resolved

- [x] State types: Separate ActualSkill/IdealSkill (different shapes)
- [x] Diffing: By source type - version for registry, gitTreeHash for git, always for local
- [x] Integrity: Existence checks only, no content verification (formatters may modify)
- [x] Plan execution: `ws.applyPlan(plan, opts)` - separate data from behavior
- [x] Current state: Merged actual + locked into single CurrentState
- [x] buildPlan signature: `buildPlan(current, ideal)` - locked already consumed
- [x] gitTreeHash in lockfile: Required for git sources (no explicit version info)
