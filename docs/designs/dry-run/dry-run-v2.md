# Dry Run v2: Desired-State Reconciliation

## Overview

Refactor dry-run support using a desired-state reconciliation pattern. Handlers compute ideal state, diff against actual, and either display or apply the resulting plan.

## Core Pattern

```typescript
// Workspace context (local vs global) determined at service creation
const ws = yield * Workspace;

yield * ws.ensureInit();
const current = yield * ws.loadCurrentState();

// Handler decides how to handle issues (computed during state loading)
// collectIssues returns Array<ActualSkillIssue | SkillStateIssue | WorkspaceIssue>
const allIssues = collectIssues(current);
if (allIssues.some((i) => i.severity === "error") && !force) {
  return (
    yield * Effect.fail(new UnhealthyWorkspaceError({ issues: allIssues }))
  );
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
| Agent grouping      | Per-skill with agents[]       | Matches display: "skill @ agent1, agent2"; always explicit          |
| Divergence handling | Handler inspects issues       | Issues on state; handler decides how to proceed                     |
| Issues on state     | Computed during load          | No separate diagnose step; issues at ActualSkill/SkillState/Current |
| Settings changes    | Derived, not explicit         | Encapsulated in skill operations                                    |
| Multiple targets    | Bulk via args                 | Commands use arrays (skills, agents)                                |
| Apply effectful     | Yes                           | Side effects require Effect                                         |

## Workspace Service

```typescript
// Error types (detailed definitions TBD)
type WorkspaceError = { _tag: "WorkspaceError"; message: string };
type CommandError = { _tag: "CommandError"; message: string };
type PlanError = { _tag: "PlanError"; message: string };
type ApplyError = { _tag: "ApplyError"; message: string };

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

  /**
   * Load current state - merges actual (disk) with locked (lockfile).
   * Issues are computed during loading and attached to the appropriate level.
   */
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
      /** Limit sync to these agents; empty = resolve from project settings during buildIdealState */
      agents: Array.Array<string>;
      /** "all" to install all discovered skills, or specific skill names */
      skills: "all" | Array.Array<string>;
      /** Skip confirmation when replacing skill from different source */
      force: boolean;
    }
  | {
      _tag: "skills-uninstall";
      /** Skill names to uninstall */
      skills: Array.Array<string>;
    }
  | {
      _tag: "skills-update";
      /** "all" to update all installed skills, or specific skill names */
      skills: "all" | Array.Array<string>;
    };
```

## buildIdealState Algorithm

High-level algorithm for computing ideal state from current state + command.

### skills-install

**Input:** `CurrentState` + `Command { skills-install }`

**Output:** `IdealState`

**Algorithm:**

1. **Start with current as baseline** — Copy existing skills to ideal (unchanged skills stay unchanged)
2. **Resolve source** — Parse source string → `SkillSource`
3. **Discover skills** — Fetch available skills from source
4. **Filter skills** — Apply `skills: "all" | string[]` filter
5. **Resolve agents** — Use command's `agents[]` or fall back to project settings
6. **For each skill to install:**
   - Compute install path (from source type + name)
   - Check if path already exists in current
   - If exists with same source → overwrite (refresh)
   - If exists with different source and `!force` → prompt for confirmation
   - If exists with different source and `force` → replace
   - If not exists → add
7. **Return ideal state**

### skills-uninstall

**Input:** `CurrentState` + `Command { skills-uninstall }`

**Output:** `IdealState`

**Algorithm:**

1. **Start with current as baseline** — Copy existing skills to ideal
2. **For each skill to uninstall:**
   - Find skill by name in ideal
   - If not found → error (or warning?)
   - If found → remove from ideal
3. **Return ideal state**

### skills-update

**Input:** `CurrentState` + `Command { skills-update }`

**Output:** `IdealState`

**Algorithm:**

1. **Start with current as baseline** — Copy existing skills to ideal
2. **Resolve skills to update** — `"all"` means all installed skills, otherwise filter by name
3. **For each skill to update:**
   - Get locked source from current state
   - If no locked source → error (can't update untracked skill)
   - Fetch latest version/hash from source
   - Update version/hash in ideal
4. **Return ideal state**

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
  | {
      _tag: "GitHub";
      owner: string;
      repo: string;
      ref: Option<string>;
      path: Option<string>;
    }
  | { _tag: "Local"; path: string };

/** Issue severity */
type Severity = "error" | "warning";

/** Issues specific to a skill on disk */
type ActualSkillIssue =
  | { _tag: "MissingSkillMd"; path: string; severity: "error" }
  | {
      _tag: "InvalidFrontmatter";
      errors: Array.Array<string>;
      severity: "error";
    }
  | { _tag: "MissingDescription"; severity: "warning" };

/** Issues from comparing actual vs locked state */
type SkillStateIssue =
  | { _tag: "MissingFromDisk"; name: string; severity: "error" }
  | { _tag: "NotInLockfile"; name: string; severity: "warning" };

/** Workspace-level issues spanning multiple skills */
type WorkspaceIssue =
  | {
      _tag: "DuplicateName";
      name: string;
      paths: Array.Array<string>;
      severity: "error";
    }
  | {
      _tag: "OrphanedSettingsRef";
      agent: string;
      skill: string;
      severity: "warning";
    };

/** Skill as it exists on disk */
interface ActualSkill {
  name: string;
  path: string;
  files: Array.Array<string>;
  frontmatter: Option<SkillFrontmatter>;
  issues: Array.Array<ActualSkillIssue>;
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
  issues: Array.Array<SkillStateIssue>;
}

/**
 * Current workspace state - all skills with their actual/locked status.
 * Uses Array (not Record) because multiple skills with the same name may exist
 * on disk (e.g., in different locations), which is itself an issue to report.
 */
interface CurrentState {
  skills: Array.Array<SkillState>;
  issues: Array.Array<WorkspaceIssue>;
}

/** Desired skill after the command */
interface IdealSkill {
  name: string;
  path: string; // Install path - pre-computed from source for convenience
  source: SkillSource;
  version: Option<string>; // Semver for registry, None for git/local
  gitTreeHash: Option<string>; // Hash of source folder for git sources
  agents: Array.Array<string>; // Target agents (explicit, never implicit "all")
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

## Apply

`ws.applyPlan(plan, { dryRun })` handles execution:

- **dryRun: true** — Display plan only, no side effects
- **dryRun: false** — Execute in order:
  1. Skill file operations (copy/remove to canonical location)
  2. Agent sync (symlinks/copies to agent directories)
  3. Settings update (add/remove skill entries)
  4. Lockfile update (source of truth, written last)

**Empty plan**: `Plan { steps: [] }` means no changes needed. Handler can display "Already up to date."

**Partial failure**: On error, stop execution and return partial result. Lockfile only updated on full success.

## Issues

Issues are computed during state loading and attached to the relevant level with distinct types:

- **ActualSkill.issues: `ActualSkillIssue[]`** — Issues specific to a skill on disk (e.g., `MissingSkillMd`, `InvalidFrontmatter`)
- **SkillState.issues: `SkillStateIssue[]`** — Issues from comparing actual vs locked (e.g., `MissingFromDisk`, `NotInLockfile`)
- **CurrentState.issues: `WorkspaceIssue[]`** — Workspace-level issues spanning multiple skills (e.g., `DuplicateName`)

This allows handlers to inspect issues at any level without a separate diagnosis step.

Note: No checksum/hash-based issues - we use version-based diffing only.

## Doctor Pattern

```typescript
// axm doctor [--dry-run]
const ws = yield * Workspace;
yield * ws.ensureInit();

const current = yield * ws.loadCurrentState();

// Collect all issues from state (union of all issue types)
type AnyIssue = ActualSkillIssue | SkillStateIssue | WorkspaceIssue;
const allIssues: Array.Array<AnyIssue> = [
  ...current.issues,
  ...current.skills.flatMap((s) => [
    ...s.issues,
    ...Option.map(s.actual, (a) => a.issues).pipe(Option.getOrElse(() => [])),
  ]),
];

const errors = allIssues.filter((i) => i.severity === "error");
const warnings = allIssues.filter((i) => i.severity === "warning");

// Display issues
yield * displayIssues(allIssues);

if (errors.length === 0 && warnings.length === 0) {
  return yield * Console.log("No issues found");
}

return { errors: errors.length, warnings: warnings.length };
```

Example output:

```
axm doctor

  error: my-skill - Missing SKILL.md
  warning: orphaned-skill - Not in lockfile

  1 error, 1 warning
```

## Benefits

1. **Testable** - Plans can be built and inspected without execution
2. **Inspectable** - Plans returned from handlers for logging/debugging
3. **Composable** - Same pattern for all commands
4. **Dry-run trivial** - Single `apply({ dryRun })` handles both modes

## Open Questions

- [ ] How to handle external state (remote skill registries)?
- [ ] Error recovery: partial apply rollback?

## Resolved

- [x] Should `buildPlan` detect no-op and return empty plan? **Yes**, `Plan { steps: [] }` is the no-op representation
- [x] State types: Separate ActualSkill/IdealSkill (different shapes)
- [x] Diffing: By source type - version for registry, gitTreeHash for git, always for local
- [x] Integrity: Existence checks only, no content verification (formatters may modify)
- [x] Plan execution: `ws.applyPlan(plan, opts)` - separate data from behavior
- [x] Current state: Merged actual + locked into single CurrentState
- [x] buildPlan signature: `buildPlan(current, ideal)` - locked already consumed
- [x] gitTreeHash in lockfile: Required for git sources (no explicit version info)
