# Dry Run v2: Desired-State Reconciliation

## Overview

Refactor dry-run support using a desired-state reconciliation pattern. Handlers compute ideal state, diff against actual, and either display or apply the resulting plan.

## Core Pattern

```typescript
import { Array, Console, Effect, Either, pipe } from "effect";

// Workspace context (local vs global) determined at service creation
const ws = yield * Workspace;

yield * ws.ensureInit();
const current = yield * ws.loadCurrentState();

// Handler decides how to handle issues (computed during state loading)
const allIssues = collectIssues(current);
const hasErrors = pipe(
  allIssues,
  Array.some((i) => i.severity === "error"),
);
if (hasErrors && !force) {
  return (
    yield * Effect.fail(new UnhealthyWorkspaceError({ issues: allIssues }))
  );
}

// Resolve agents before building ideal state (handler responsibility)
const resolvedAgents = Array.isNonEmptyArray(command.agents)
  ? command.agents
  : projectSettings.defaultAgents;

// buildIdealState is effectful (fetches from source)
const ideal =
  yield *
  buildIdealState(current, {
    _tag: "skills-install",
    source: "owner/repo",
    agents: resolvedAgents, // Already resolved, not "fall back to settings"
    skills: ["my-skill"], // or "all"
    force: false,
  });

// buildPlan is pure - returns Either
const plan =
  yield *
  pipe(
    buildPlan(current, ideal),
    Either.match({
      onLeft: Effect.fail,
      onRight: Effect.succeed,
    }),
  );

// Check for empty plan
if (Array.isEmptyArray(plan.steps)) {
  yield * Console.log("Already up to date.");
  return plan;
}

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
| Agent sync          | Per-skill in IdealSkill       | Agents resolved by handler, included in ideal state and plan steps  |
| Plan steps          | User intent, not impl         | Show install/update/uninstall, hide clean+add                       |
| Agent grouping      | Per-skill with agents[]       | Matches display: "skill @ agent1, agent2"; always explicit          |
| Divergence handling | Handler inspects issues       | Issues on state; handler decides how to proceed                     |
| Issues on state     | Computed during load          | No separate diagnose step; issues at ActualSkill/SkillState/Current |
| Settings changes    | Derived from plan steps       | Install/update → add entry; uninstall → delete entry                |
| Multiple targets    | Bulk via args                 | Commands use arrays (skills, agents)                                |
| Apply effectful     | Yes                           | Side effects require Effect                                         |
| buildPlan           | Pure, returns Either          | No effects; Either for error handling; semver for registry versions |
| Install path        | Computed on demand            | Derived from source type + name; not stored                         |

## Workspace Service

```typescript
import { Array, Data, Effect, Layer, Option } from "effect";

// Error types
class WorkspaceError extends Data.TaggedError("WorkspaceError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
}> {}

class CommandError extends Data.TaggedError("CommandError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
}> {}

class ApplyError extends Data.TaggedError("ApplyError")<{
  readonly message: string;
  readonly step: Option.Option<PlanStep>;
  readonly cause: Option.Option<unknown>;
}> {}

class UnhealthyWorkspaceError extends Data.TaggedError(
  "UnhealthyWorkspaceError",
)<{
  readonly issues: Array.Array<AnyIssue>;
}> {}

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

## Pure Functions

These functions are pure and can be tested without effects:

```typescript
import { Array, Either, Option, pipe, Record } from "effect";

/**
 * Compute install path from source type and skill name.
 * Registry skills: .axm/extensions/@<scope>/skills/<name>
 * External skills: .axm/extensions/external/skills/<name>
 */
const computeInstallPath = (source: SkillSource, name: string): string => {
  switch (source._tag) {
    case "Registry":
      return `.axm/extensions/@${source.scope}/skills/${name}`;
    case "GitHub":
    case "Local":
      return `.axm/extensions/external/skills/${name}`;
  }
};

/**
 * Collect all issues from current state into a flat array.
 * Returns issues from all levels: workspace, skill state, and actual skill.
 */
const collectIssues = (current: CurrentState): Array.Array<AnyIssue> =>
  pipe(
    current.skills,
    Array.flatMap((s) =>
      Array.appendAll(
        s.issues,
        pipe(
          s.actual,
          Option.map((a) => a.issues),
          Option.getOrElse(() => Array.empty<ActualSkillIssue>()),
        ),
      ),
    ),
    Array.appendAll(current.issues),
  );

/** Error during plan building */
class BuildPlanError extends Data.TaggedError("BuildPlanError")<{
  readonly message: string;
  readonly cause: Option.Option<unknown>;
}> {}

/** Compare versions using semver for registry sources */
const versionsEqual = (
  a: Option.Option<string>,
  b: Option.Option<string>,
): boolean =>
  pipe(
    Option.all([a, b]),
    Option.match({
      onNone: () => Option.isNone(a) && Option.isNone(b),
      onSome: ([va, vb]) => semver.eq(va, vb),
    }),
  );

/**
 * Build execution plan by diffing current vs ideal state.
 * Pure function - returns Either for error handling.
 */
const buildPlan = (
  current: CurrentState,
  ideal: IdealState,
): Either.Either<Plan, BuildPlanError> => {
  // Find skills to install or update
  const installOrUpdateSteps = pipe(
    ideal.skills,
    Array.filterMap((idealSkill) => {
      const installPath = computeInstallPath(
        idealSkill.source,
        idealSkill.name,
      );
      const currentSkill = pipe(
        current.skills,
        Array.findFirst(
          (s) => Option.isSome(s.actual) && s.actual.value.path === installPath,
        ),
      );

      return pipe(
        currentSkill,
        Option.match({
          onNone: () =>
            // Not on disk → install
            Option.some<PlanStep>({
              _tag: "InstallSkill",
              skill: idealSkill.name,
              source: idealSkill.source,
              version: idealSkill.version,
              gitTreeHash: idealSkill.gitTreeHash,
              agents: idealSkill.agents,
            }),
          onSome: (cs) =>
            pipe(
              cs.locked,
              Option.flatMap((locked) => {
                const needsUpdate =
                  (idealSkill.source._tag === "Registry" &&
                    !versionsEqual(idealSkill.version, locked.version)) ||
                  (idealSkill.source._tag !== "Registry" &&
                    !Option.equals(
                      idealSkill.gitTreeHash,
                      locked.gitTreeHash,
                    )) ||
                  idealSkill.source._tag === "Local"; // Local always updates

                return needsUpdate
                  ? Option.some<PlanStep>({
                      _tag: "UpdateSkill",
                      skill: idealSkill.name,
                      source: idealSkill.source,
                      fromVersion: locked.version,
                      toVersion: idealSkill.version,
                      fromHash: locked.gitTreeHash,
                      toHash: idealSkill.gitTreeHash,
                      agents: idealSkill.agents,
                    })
                  : Option.none();
              }),
            ),
        }),
      );
    }),
  );

  // Find skills to uninstall (in current but not in ideal)
  const uninstallSteps = pipe(
    current.skills,
    Array.filterMap((currentSkill) =>
      pipe(
        Option.all([currentSkill.actual, currentSkill.locked]),
        Option.flatMap(([actual, locked]) => {
          const inIdeal = pipe(
            ideal.skills,
            Array.some(
              (s) => computeInstallPath(s.source, s.name) === actual.path,
            ),
          );

          return inIdeal
            ? Option.none()
            : Option.some<PlanStep>({
                _tag: "UninstallSkill",
                skill: currentSkill.name,
                agents: locked.agents,
              });
        }),
      ),
    ),
  );

  const steps = Array.appendAll(installOrUpdateSteps, uninstallSteps);
  return Either.right({ steps });
};

/** Check if plan has any changes */
const hasChanges = (plan: Plan): boolean => Array.isNonEmptyArray(plan.steps);
```

## Effectful Functions

These functions require effects (I/O, fetching):

```typescript
/**
 * Compute ideal state for a command based on current state.
 * Effectful because it may fetch from remote sources.
 */
const buildIdealState = (
  current: CurrentState,
  cmd: Command,
): Effect.Effect<IdealState, CommandError> =>
  Effect.gen(function* () {
    switch (cmd._tag) {
      case "skills-install":
        return yield* buildIdealForInstall(current, cmd);
      case "skills-uninstall":
        return yield* buildIdealForUninstall(current, cmd);
      case "skills-update":
        return yield* buildIdealForUpdate(current, cmd);
    }
  });
```

## Commands

Discriminated union of all supported commands:

```typescript
type Command =
  | {
      readonly _tag: "skills-install";
      /** GitHub shorthand (owner/repo), local path, or URL */
      readonly source: string;
      /** Target agents (already resolved by handler) */
      readonly agents: Array.Array<string>;
      /** "all" to install all discovered skills, or specific skill names */
      readonly skills: "all" | Array.Array<string>;
      /** Skip confirmation when replacing skill from different source */
      readonly force: boolean;
    }
  | {
      readonly _tag: "skills-uninstall";
      /** Skill names to uninstall */
      readonly skills: Array.Array<string>;
    }
  | {
      readonly _tag: "skills-update";
      /** "all" to update all installed skills, or specific skill names */
      readonly skills: "all" | Array.Array<string>;
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
5. **For each skill to install:**
   - Compute install path via `computeInstallPath(source, name)`
   - Check if path already exists in current (lookup by path)
   - If exists with same source → overwrite (refresh)
   - If exists with different source and `!force` → prompt for confirmation
   - If exists with different source and `force` → replace
   - If not exists → add
6. **Return ideal state**

### skills-uninstall

**Input:** `CurrentState` + `Command { skills-uninstall }`

**Output:** `IdealState`

**Algorithm:**

1. **Start with current as baseline** — Copy existing skills to ideal
2. **For each skill to uninstall:**
   - Find skill by name in ideal
   - If not found → error (or warning?)
   - If found → exclude from ideal
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
import { Array, Option, Record } from "effect";

/** Registry location - remote URL or local filesystem path */
type RegistryLocation =
  | { readonly _tag: "Remote"; readonly url: string }
  | { readonly _tag: "FileSystem"; readonly path: string };

/** Skill source - where to fetch from */
type SkillSource =
  | {
      readonly _tag: "Registry";
      readonly location: RegistryLocation;
      readonly scope: string;
      readonly name: string;
      readonly version: Option.Option<string>; // None = latest
    }
  | {
      readonly _tag: "GitHub";
      readonly owner: string;
      readonly repo: string;
      readonly ref: Option.Option<string>;
      readonly path: Option.Option<string>;
    }
  | { readonly _tag: "Local"; readonly path: string };

/** Issue severity */
type Severity = "error" | "warning";

/** Union of all issue types */
type AnyIssue = ActualSkillIssue | SkillStateIssue | WorkspaceIssue;

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
  readonly name: string;
  readonly path: string;
  readonly files: Array.Array<string>;
  readonly frontmatter: Option.Option<SkillFrontmatter>;
  readonly issues: Array.Array<ActualSkillIssue>;
}

/** Skill entry from lockfile */
interface LockedSkill {
  readonly name: string;
  readonly source: SkillSource;
  readonly version: Option.Option<string>; // Semver for registry, None for git/local
  readonly gitTreeHash: Option.Option<string>; // Hash of source folder for git sources
  readonly agents: Array.Array<string>; // Agents this skill is installed for
  readonly installedAt: Date;
  readonly updatedAt: Date;
}

/** Combined state for a skill - actual + locked merged */
interface SkillState {
  readonly name: string;
  readonly actual: Option.Option<ActualSkill>; // None = not on disk
  readonly locked: Option.Option<LockedSkill>; // None = not in lockfile
  readonly issues: Array.Array<SkillStateIssue>;
}

/**
 * Current workspace state - all skills with their actual/locked status.
 *
 * Uses Array (not Record) to accommodate duplicate skill names on disk
 * (e.g., same skill installed from different sources). This is a must-have
 * requirement for detecting and reporting conflicts. Tradeoff: O(n) lookups
 * in buildPlan vs O(1) with Record, acceptable for typical workspace sizes.
 */
interface CurrentState {
  readonly skills: Array.Array<SkillState>;
  readonly issues: Array.Array<WorkspaceIssue>;
}

/** Desired skill after the command */
interface IdealSkill {
  readonly name: string;
  readonly source: SkillSource;
  readonly version: Option.Option<string>; // Semver for registry, None for git/local
  readonly gitTreeHash: Option.Option<string>; // Hash of source folder for git sources
  readonly agents: Array.Array<string>; // Target agents (explicit, never implicit "all")
}

/** Desired outcome - what we want after the command */
interface IdealState {
  readonly skills: Array.Array<IdealSkill>;
}
```

**Installation model:**

- Registry skills install to `.axm/extensions/@<scope>/skills/<name>`
- External skills (GitHub, local) install to `.axm/extensions/external/skills/<name>`
- Agents are resolved by handler before buildIdealState; passed explicitly in command

**Plan computation** (diff of current vs ideal, matched by computed path):

- In ideal but not current → install
- In current but not ideal → uninstall
- In both, version or hash differs → update
- In both, same version/hash → no-op

**Skill identity**: install path (derived from source type + name via `computeInstallPath`)

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
      readonly _tag: "InstallSkill";
      readonly skill: string;
      readonly source: SkillSource;
      readonly version: Option.Option<string>;
      readonly gitTreeHash: Option.Option<string>;
      readonly agents: Array.Array<string>;
    }
  | {
      readonly _tag: "UpdateSkill";
      readonly skill: string;
      readonly source: SkillSource;
      readonly fromVersion: Option.Option<string>;
      readonly toVersion: Option.Option<string>;
      readonly fromHash: Option.Option<string>; // For git sources without version
      readonly toHash: Option.Option<string>;
      readonly agents: Array.Array<string>;
    }
  | {
      readonly _tag: "UninstallSkill";
      readonly skill: string;
      readonly agents: Array.Array<string>; // Remove from these agents + canonical location + settings + lockfile
    };

/** Result of applying a plan */
interface ApplyResult {
  readonly applied: Array.Array<PlanStep>;
  readonly failed: Array.Array<{ step: PlanStep; error: ApplyError }>;
  readonly summary: {
    readonly installed: number;
    readonly updated: number;
    readonly uninstalled: number;
    readonly failed: number;
  };
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

Implementation details (e.g., update = clean + add) are hidden inside `applyPlan()`.

## Settings

Settings entries are derived from plan steps during apply. The `settings.skills` map stores skill sources for each installed skill.

```typescript
/**
 * Settings entry for a skill.
 * String form is shorthand for registry FQN.
 * Object forms for other source types.
 */
type SkillSettingsEntry =
  | string // Registry FQN shorthand: "@scope/skill-name" or "@scope/skill-name@version"
  | {
      readonly _tag: "FileSystemRegistry";
      readonly path: string;
      readonly name: string;
    }
  | {
      readonly _tag: "RemoteRegistry";
      readonly origin: string;
      readonly scope: string;
      readonly name: string;
      readonly version: Option.Option<string>;
    }
  | {
      readonly _tag: "GitHub";
      readonly owner: string;
      readonly repo: string;
      readonly ref: Option.Option<string>;
      readonly path: Option.Option<string>;
    }
  | {
      readonly _tag: "Local";
      readonly path: string;
    };

/**
 * Convert SkillSource to settings entry.
 * Uses FQN shorthand for registry sources (simpler for users to read).
 * Full source details are preserved in the lockfile.
 */
const toSettingsEntry = (source: SkillSource): SkillSettingsEntry => {
  switch (source._tag) {
    case "Registry":
      // Use FQN shorthand for registry sources
      return Option.match(source.version, {
        onNone: () => `@${source.scope}/${source.name}`,
        onSome: (v) => `@${source.scope}/${source.name}@${v}`,
      });
    case "GitHub":
      return {
        _tag: "GitHub",
        owner: source.owner,
        repo: source.repo,
        ref: source.ref,
        path: source.path,
      };
    case "Local":
      return { _tag: "Local", path: source.path };
  }
};
```

**Settings update during apply:**

- `InstallSkill` / `UpdateSkill` → `settings.skills[name] = toSettingsEntry(source)`
- `UninstallSkill` → `delete settings.skills[name]`

## Apply

`ws.applyPlan(plan, { dryRun })` handles execution:

- **dryRun: true** — Display plan only, no side effects
- **dryRun: false** — Execute in order:
  1. Skill file operations (copy/delete to canonical location)
  2. Agent sync (symlinks/copies to agent directories)
  3. Settings update (derived from plan steps)
  4. Lockfile update (source of truth, written last)

**Settings integration during apply:**

```typescript
const updateSettingsFromPlan = (settings: Settings, plan: Plan): Settings =>
  pipe(
    plan.steps,
    Array.reduce(settings, (acc, step) => {
      switch (step._tag) {
        case "InstallSkill":
        case "UpdateSkill":
          return {
            ...acc,
            skills: Record.set(
              acc.skills,
              step.skill,
              toSettingsEntry(step.source),
            ),
          };
        case "UninstallSkill":
          return {
            ...acc,
            skills: Record.remove(acc.skills, step.skill),
          };
      }
    }),
  );
```

**Empty plan**: `Plan { steps: [] }` means no changes needed. Handler checks `plan.steps.length === 0` and displays "Already up to date."

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
import { Array, Console, Effect, pipe } from "effect";

// axm doctor [--dry-run]
const ws = yield * Workspace;
yield * ws.ensureInit();

const current = yield * ws.loadCurrentState();

// Collect all issues from state using pure helper
const allIssues = collectIssues(current);

const errors = pipe(
  allIssues,
  Array.filter((i) => i.severity === "error"),
);
const warnings = pipe(
  allIssues,
  Array.filter((i) => i.severity === "warning"),
);

// Display issues
yield * displayIssues(allIssues);

if (Array.isEmptyArray(errors) && Array.isEmptyArray(warnings)) {
  return yield * Console.log("No issues found");
}

return { errors: Array.length(errors), warnings: Array.length(warnings) };
```

Example output:

```
axm doctor

  error: my-skill - Missing SKILL.md
  warning: orphaned-skill - Not in lockfile

  1 error, 1 warning
```

## Benefits

1. **Testable** - Pure functions (`buildPlan`, `collectIssues`, `computeInstallPath`) can be unit tested without effects
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
- [x] buildPlan signature: `buildPlan(current, ideal)` - pure function, returns Either
- [x] gitTreeHash in lockfile: Required for git sources (no explicit version info)
- [x] Install path: Computed on demand via `computeInstallPath`, not stored
- [x] Agent resolution: Handler resolves agents before buildIdealState
- [x] Settings entries: Derived from plan steps; SkillSettingsEntry union type
- [x] collectIssues: Pure helper function defined
- [x] UnhealthyWorkspaceError: Added to error types
- [x] LockedSkill: Defined with agents field for tracking per-skill agent installations
- [x] Uninstall semantics: Removes from specified agents + canonical location + settings + lockfile
- [x] No repair concept: Simplified to install/update/uninstall only
- [x] Version comparison: Semver for registry sources, hash for git sources
- [x] Array for CurrentState.skills: Required to detect duplicate skill names (O(n) tradeoff accepted)
