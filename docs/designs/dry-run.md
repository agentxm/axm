# Dry Run v2: Desired-State Reconciliation

## Overview

Refactor dry-run support using a desired-state reconciliation pattern. Handlers compute ideal state, diff against actual, and either display or apply the resulting plan.

## Core Pattern

```typescript
import { Array, Console, Effect, pipe } from "effect";

// Workspace context (local vs global) determined at handler level
const ws = makeWorkspaceContext(options);

yield * ensureInit(ws);
const current = yield * loadCurrentState(ws);

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

// buildPlan is pure
const plan = buildPlan(current, ideal);

// Check for empty plan
if (Array.isEmptyArray(plan.steps)) {
  yield * Console.log("Already up to date.");
  return plan;
}

yield * applyPlan(ws, plan, { dryRun });

return plan;
```

## Design Decisions

| Decision            | Choice                        | Rationale                                                           |
| ------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Command encoding    | Discriminated union           | Simple, explicit, type-safe                                         |
| Plan execution      | `applyPlan(ws, plan, opts)`   | Separate data from behavior; easier to test                         |
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
| buildPlan           | Pure, returns Plan            | No effects; validation happens in buildIdealState                   |
| Install path        | Computed on demand            | Derived from source type + name; not stored                         |
| Skill identity      | Name (unique across sources)  | Simplifies matching; duplicates detected as errors during load      |
| Uninstall scope     | Requires actual + locked      | "Locked but not on disk" is a health issue, not an uninstall target |

## Workspace Context

```typescript
import { Array, Data, Effect, Option } from "effect";

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

interface ApplyOptions {
  readonly dryRun: boolean;
  /** Optional progress callback - UI rendering is handler responsibility */
  readonly onProgress?: (
    step: PlanStep,
    status: "starting" | "completed",
  ) => void;
}

/** Workspace context - passed to workspace functions */
interface WorkspaceContext {
  /** Workspace root path (e.g., .axm/ or ~/.axm/) */
  readonly path: string;

  /** Whether user prompts are allowed */
  readonly interactive: boolean;
}

/** Create workspace context from handler options */
const makeWorkspaceContext = (options: {
  global: boolean;
  interactive: boolean;
}): WorkspaceContext => ({
  path: options.global ? globalAxmPath() : localAxmPath(),
  interactive: options.interactive,
});

/**
 * Ensure workspace is initialized.
 * If interactive and not initialized, walks user through setup.
 * If non-interactive and not initialized, fails with WorkspaceNotInitialized.
 */
declare const ensureInit: (
  ws: WorkspaceContext,
) => Effect.Effect<void, WorkspaceError>;

/**
 * Load current state - merges actual (disk) with locked (lockfile).
 * Issues are computed during loading and attached to the appropriate level.
 */
declare const loadCurrentState: (
  ws: WorkspaceContext,
) => Effect.Effect<CurrentState, WorkspaceError>;

/** Apply a plan - display if dryRun, execute otherwise */
declare const applyPlan: (
  ws: WorkspaceContext,
  plan: Plan,
  opts: ApplyOptions,
) => Effect.Effect<ApplyResult, ApplyError>;
```

## Pure Functions

These functions are pure and can be tested without effects:

```typescript
import { Array, Data, Option, pipe, Record } from "effect";
import * as semver from "semver";

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

/** Compare versions using semver for registry sources, with fallback for non-semver */
const versionsEqual = (
  a: Option.Option<string>,
  b: Option.Option<string>,
): boolean =>
  pipe(
    Option.all([a, b]),
    Option.match({
      onNone: () => Option.isNone(a) && Option.isNone(b),
      onSome: ([va, vb]) => {
        // Attempt semver comparison, fall back to string equality
        const parsedA = semver.parse(va);
        const parsedB = semver.parse(vb);
        return parsedA && parsedB ? semver.eq(parsedA, parsedB) : va === vb; // Fallback for non-semver versions
      },
    }),
  );

/**
 * Build execution plan by diffing current vs ideal state.
 * Pure function - no validation, just diffing.
 *
 * Matching strategy: Skills are matched by name (unique across all sources).
 * - Install/update: iterate ideal skills, find matching current skill by name
 * - Uninstall: iterate current skills, check if name exists in ideal
 */
const buildPlan = (current: CurrentState, ideal: IdealState): Plan => {
  // Find skills to install or update
  const installOrUpdateSteps = pipe(
    ideal.skills,
    Array.filterMap((idealSkill) => {
      // Match by name - skill names are unique across all sources
      const currentSkill = pipe(
        current.skills,
        Array.findFirst((s) => s.name === idealSkill.name),
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
  // Match by name - consistent with install/update matching
  const uninstallSteps = pipe(
    current.skills,
    Array.filterMap((currentSkill) =>
      pipe(
        Option.all([currentSkill.actual, currentSkill.locked]),
        Option.flatMap(([_actual, locked]) => {
          const inIdeal = pipe(
            ideal.skills,
            Array.some((s) => s.name === currentSkill.name),
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
  return { steps };
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
   - Find skill by name in current
   - If not found → error
   - If found → exclude from ideal
3. **Return ideal state**

**Note:** Only skills that exist both on disk (actual) and in lockfile (locked) can be uninstalled.
Skills that are "locked but not on disk" represent a health issue (MissingFromDisk) and should be
resolved via `axm doctor` or by reinstalling, not by uninstalling.

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

## buildIdealFor\* Implementations

```typescript
import { Array, Effect, Option, pipe } from "effect";

// --- Helper function signatures (implementation elsewhere) ---

/** Parse source string into SkillSource. */
declare const parseSource: (
  source: string,
) => Effect.Effect<SkillSource, CommandError>;

/** Discover skills available from a source (may clone/fetch). */
declare const discoverSkills: (
  source: SkillSource,
) => Effect.Effect<Array.Array<DiscoveredSkill>, CommandError>;

/** Fetch latest version/hash for a source. */
declare const fetchLatestVersion: (
  source: SkillSource,
) => Effect.Effect<
  { version: Option.Option<string>; gitTreeHash: Option.Option<string> },
  CommandError
>;

/** Compare two sources for equality. */
declare const sourcesEqual: (a: SkillSource, b: SkillSource) => boolean;

interface DiscoveredSkill {
  readonly name: string;
  readonly version: Option.Option<string>;
  readonly gitTreeHash: Option.Option<string>;
}

// --- Implementation ---

/** Convert current skill state to ideal representation. */
const currentToIdeal = (skill: SkillState): Option.Option<IdealSkill> =>
  pipe(
    skill.locked,
    Option.map((locked) => ({
      name: skill.name,
      source: locked.source,
      version: locked.version,
      gitTreeHash: locked.gitTreeHash,
      agents: locked.agents,
    })),
  );

/** Check if skill name already exists in current state. */
const nameExists = (current: CurrentState, name: string): boolean =>
  pipe(
    current.skills,
    Array.some((s) => s.name === name),
  );

/**
 * Build ideal state for install command.
 */
const buildIdealForInstall = (
  current: CurrentState,
  cmd: Command & { _tag: "skills-install" },
): Effect.Effect<IdealState, CommandError> =>
  Effect.gen(function* () {
    // Step 1: Parse and validate source
    const source = yield* parseSource(cmd.source);

    // Step 2: Discover available skills from source
    const discovered = yield* discoverSkills(source);

    // Step 3: Filter by skills parameter
    const toInstall =
      cmd.skills === "all"
        ? discovered
        : pipe(
            discovered,
            Array.filter((s) => cmd.skills.includes(s.name)),
          );

    // Step 4: Check for name conflicts (unique across all sources)
    const conflicts = pipe(
      toInstall,
      Array.filter((s) => nameExists(current, s.name)),
      Array.filter((s) => {
        // Allow reinstall from same source, reject different source
        const existing = pipe(
          current.skills,
          Array.findFirst((cs) => cs.name === s.name),
          Option.flatMap((cs) => cs.locked),
        );
        return pipe(
          existing,
          Option.match({
            onNone: () => false,
            onSome: (locked) => !sourcesEqual(locked.source, source),
          }),
        );
      }),
    );

    if (Array.isNonEmptyArray(conflicts) && !cmd.force) {
      return yield* Effect.fail(
        new CommandError({
          message: `Skills already installed from different source: ${conflicts.map((s) => s.name).join(", ")}`,
          cause: Option.none(),
        }),
      );
    }

    // Step 5: Build ideal state
    // Keep existing skills not being replaced
    const existing = pipe(
      current.skills,
      Array.filterMap((s) => {
        const beingReplaced = pipe(
          toInstall,
          Array.some((i) => i.name === s.name),
        );
        return beingReplaced ? Option.none() : currentToIdeal(s);
      }),
    );

    // Add new/replacement skills
    const newSkills = pipe(
      toInstall,
      Array.map(
        (s): IdealSkill => ({
          name: s.name,
          source,
          version: s.version,
          gitTreeHash: s.gitTreeHash,
          agents: cmd.agents,
        }),
      ),
    );

    return { skills: Array.appendAll(existing, newSkills) };
  });

/**
 * Build ideal state for uninstall command.
 */
const buildIdealForUninstall = (
  current: CurrentState,
  cmd: Command & { _tag: "skills-uninstall" },
): Effect.Effect<IdealState, CommandError> =>
  Effect.gen(function* () {
    // Validate all skills exist
    const notFound = pipe(
      cmd.skills,
      Array.filter((name) => !nameExists(current, name)),
    );

    if (Array.isNonEmptyArray(notFound)) {
      return yield* Effect.fail(
        new CommandError({
          message: `Skills not found: ${notFound.join(", ")}`,
          cause: Option.none(),
        }),
      );
    }

    // Keep skills not being uninstalled
    const remaining = pipe(
      current.skills,
      Array.filter((s) => !cmd.skills.includes(s.name)),
      Array.filterMap(currentToIdeal),
    );

    return { skills: remaining };
  });

/**
 * Build ideal state for update command.
 */
const buildIdealForUpdate = (
  current: CurrentState,
  cmd: Command & { _tag: "skills-update" },
): Effect.Effect<IdealState, CommandError> =>
  Effect.gen(function* () {
    // Determine which skills to update
    const toUpdate =
      cmd.skills === "all"
        ? pipe(
            current.skills,
            Array.filter((s) => Option.isSome(s.locked)),
          )
        : pipe(
            current.skills,
            Array.filter(
              (s) => cmd.skills.includes(s.name) && Option.isSome(s.locked),
            ),
          );

    // Validate requested skills exist
    if (cmd.skills !== "all") {
      const notFound = pipe(
        cmd.skills,
        Array.filter((name) => !nameExists(current, name)),
      );
      if (Array.isNonEmptyArray(notFound)) {
        return yield* Effect.fail(
          new CommandError({
            message: `Skills not found: ${notFound.join(", ")}`,
            cause: Option.none(),
          }),
        );
      }
    }

    // Fetch latest versions for skills being updated
    const updated = yield* pipe(
      toUpdate,
      Effect.forEach(
        (skill) =>
          Effect.gen(function* () {
            const locked = Option.getOrThrow(skill.locked); // Safe: filtered above
            const latest = yield* fetchLatestVersion(locked.source);
            return {
              name: skill.name,
              source: locked.source,
              version: latest.version,
              gitTreeHash: latest.gitTreeHash,
              agents: locked.agents,
            } satisfies IdealSkill;
          }),
        { concurrency: "inherit" },
      ),
    );

    // Keep skills not being updated
    const unchanged = pipe(
      current.skills,
      Array.filter(
        (s) =>
          !pipe(
            toUpdate,
            Array.some((u) => u.name === s.name),
          ),
      ),
      Array.filterMap(currentToIdeal),
    );

    return { skills: Array.appendAll(unchanged, updated) };
  });
```

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

/** Parsed SKILL.md frontmatter */
interface SkillFrontmatter {
  readonly name?: string;
  readonly description?: string;
  readonly version?: string;
  readonly triggers?: readonly string[];
}

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
 * Uses Array (not Record) to detect and report duplicate skill names on disk
 * (e.g., same skill manually copied to multiple locations). Duplicates are
 * workspace-level errors (DuplicateName issue) that block operations.
 *
 * When no duplicates exist, skills are matched by name (unique identifier).
 * The O(n) lookup tradeoff is acceptable for typical workspace sizes (<100 skills).
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

**Plan computation** (diff of current vs ideal, matched by name):

- In ideal but not current → install
- In current but not ideal → uninstall
- In both, version or hash differs → update
- In both, same version/hash → no-op

**Skill identity**: name (unique across all sources)

- Registry `@scope/skill` → `.axm/extensions/@scope/skills/skill`
- External (GitHub, Local, etc.) → `.axm/extensions/external/skills/skill`
- Duplicate names rejected: installing `my-skill` from GitHub when `@scope/my-skill` exists fails
- Rationale: Simplifies agent sync, settings, and user mental model

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
 *
 * Note: Registry variants (FileSystemRegistry, RemoteRegistry) will be added
 * when registry infrastructure lands. For now, only GitHub and Local are supported.
 */
type SkillSettingsEntry =
  | string // Registry FQN shorthand: "@scope/skill-name" or "@scope/skill-name@version"
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

### Settings vs Lockfile

Both files track installed skills but serve different purposes:

| Aspect      | Settings (`settings.yaml`)          | Lockfile (`axm-lock.yaml`)            |
| ----------- | ----------------------------------- | ------------------------------------- |
| Purpose     | User-facing source declarations     | Exact state for reproducibility       |
| Contains    | Source references (what to install) | Resolved versions, hashes, timestamps |
| Editability | User-editable                       | Machine-managed                       |
| Use case    | "Install from this source"          | "This exact version was installed"    |
| Example     | `my-skill: "github:org/repo"`       | `my-skill: { gitTreeHash: "abc123" }` |

**Flow:**

1. User runs `axm skills install` with a source
2. CLI resolves source, copies files, creates lockfile entry, updates settings
3. Skills and lockfile are committed to source control

## Apply

`applyPlan(ctx, plan, opts)` handles execution (see `ApplyOptions` in Workspace Context section):

- **dryRun: true** — Display plan only, no side effects
- **dryRun: false** — Execute in order:
  1. Skill file operations (copy/delete to canonical location)
  2. Agent sync (symlinks/copies to agent directories)
  3. Settings update (derived from plan steps)
  4. Lockfile update (source of truth, written last)

**Progress reporting:**

Progress is a UI concern handled at the handler level, not inside the Workspace service:

```typescript
// Handler level
const spinner = createSpinnerHelper();
spinner.start("Applying changes...");

const result =
  yield *
  ws.applyPlan(plan, {
    dryRun,
    onProgress: (step, status) => {
      if (status === "starting") {
        spinner.stop(`Processing ${step.skill}...`);
      }
    },
  });

spinner.stop("Done.");
```

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

**Partial failure**: On error, stop execution and return partial `ApplyResult`. No automatic rollback:

- Files written before failure remain on disk
- Lockfile and settings are only updated on full success
- `axm doctor` detects orphaned files as `NotInLockfile` warning
- User can re-run command or manually clean up

Rationale: Rollback logic doubles implementation complexity and introduces ambiguity (what if rollback fails?). Partial state is observable and recoverable via existing tools.

## Agent Sync

Agent sync propagates skills from the canonical location to agent-specific directories. This is an implementation detail hidden from plan output.

**Mechanics:**

1. **Discovery** — Detect installed agents by checking known paths:
   - Claude Code: `~/.claude/` or `.claude/`
   - Cursor: `~/.cursor/` or `.cursor/`
   - Other agents: configurable via settings

2. **Sync method** — Platform-dependent:
   - Unix (macOS, Linux): Symlinks from agent dir to canonical location
   - Windows: File copies (symlinks require admin privileges)

3. **Directory structure:**

   ```
   .axm/extensions/@scope/skills/my-skill/    # Canonical location
   .claude/skills/my-skill -> ../../../.axm/extensions/@scope/skills/my-skill  # Symlink
   .cursor/skills/my-skill -> ../../../.axm/extensions/@scope/skills/my-skill  # Symlink
   ```

4. **Timing** — Sync happens after skill files are in place, before lockfile update:
   - Install: Create symlinks/copies to target agents
   - Update: Symlinks unchanged (point to same canonical path); copies refreshed
   - Uninstall: Remove symlinks/copies from agents

**Agent selection:**

- `IdealSkill.agents` specifies target agents (resolved by handler)
- Empty array means no agent sync (skill available but not linked)
- Plan steps include agents for display: "my-skill @ claude, cursor"

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
const ws = makeWorkspaceContext(options);
yield * ensureInit(ws);

const current = yield * loadCurrentState(ws);

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

## Code Mapping

Mapping from existing codebase to new interfaces:

| Existing Code            | Location           | New Interface          | Notes                                             |
| ------------------------ | ------------------ | ---------------------- | ------------------------------------------------- |
| `ParsedSource`           | `source-parser.ts` | `SkillSource`          | Rename `type` → `_tag`, add `Registry` variant    |
| `ActualSkill`            | `state/types.ts`   | `ActualSkill`          | Add `issues` field, remove `validity`             |
| `LockedSkill`            | `state/types.ts`   | `LockedSkill`          | Rename `folderHash` → `gitTreeHash`, add `agents` |
| `SkillState`             | `state/types.ts`   | `SkillState`           | Replace `validity` with `issues` array            |
| `SkillChange`            | `state/types.ts`   | `PlanStep`             | Collapse Add/Update/Remove; drop Unchanged/Repair |
| `loadSkillsState()`      | `state/load.ts`    | `loadCurrentState(ws)` | Returns `CurrentState` with merged issues         |
| `buildIdealForInstall()` | `state/ideal.ts`   | `buildIdealState()`    | Generalize to all commands                        |
| `computeDiff()`          | `state/diff.ts`    | `buildPlan()`          | Pure function, returns `Plan`                     |
| `SkillFrontmatter`       | `state/types.ts`   | `SkillFrontmatter`     | Same structure, already exists                    |

## Apply Implementation

High-level implementation outline (guidance, not prescriptive):

```typescript
import { Array, Effect, Either, pipe } from "effect";

/** Apply a plan - display if dryRun, execute otherwise */
const applyPlan = (
  plan: Plan,
  opts: ApplyOptions,
): Effect.Effect<ApplyResult, ApplyError> =>
  Effect.gen(function* () {
    if (opts.dryRun) {
      yield* displayPlan(plan);
      return emptyApplyResult();
    }

    const results: Array<{ step: PlanStep; error?: ApplyError }> = [];

    // Execute steps sequentially, stop on first failure
    for (const step of plan.steps) {
      opts.onProgress?.(step, "starting");
      const result = yield* applyStep(step).pipe(Effect.either);

      if (Either.isLeft(result)) {
        results.push({ step, error: result.left });
        break; // Stop on first failure
      }

      results.push({ step });
      opts.onProgress?.(step, "completed");
    }

    // Only update lockfile/settings if all steps succeeded
    const allSucceeded = results.every((r) => !r.error);
    if (allSucceeded) {
      yield* updateLockfile(plan);
      yield* updateSettings(plan);
    }

    return buildApplyResult(results);
  });

/** Route to step-specific implementation */
const applyStep = (step: PlanStep): Effect.Effect<void, ApplyError> => {
  switch (step._tag) {
    case "InstallSkill":
      return installSkill(step);
    case "UpdateSkill":
      return updateSkill(step); // Implemented as delete + install
    case "UninstallSkill":
      return uninstallSkill(step);
  }
};

/** Install a skill to canonical location + sync to agents */
declare const installSkill: (
  step: PlanStep & { _tag: "InstallSkill" },
) => Effect.Effect<void, ApplyError>;

/** Update = delete existing + install new */
declare const updateSkill: (
  step: PlanStep & { _tag: "UpdateSkill" },
) => Effect.Effect<void, ApplyError>;

/** Remove from canonical location + agents */
declare const uninstallSkill: (
  step: PlanStep & { _tag: "UninstallSkill" },
) => Effect.Effect<void, ApplyError>;
```

## Resolved

- [x] Should `buildPlan` detect no-op and return empty plan? **Yes**, `Plan { steps: [] }` is the no-op representation
- [x] State types: Separate ActualSkill/IdealSkill (different shapes)
- [x] Diffing: By source type - version for registry, gitTreeHash for git, always for local
- [x] Integrity: Existence checks only, no content verification (formatters may modify)
- [x] Plan execution: `ws.applyPlan(plan, opts)` - separate data from behavior
- [x] Current state: Merged actual + locked into single CurrentState
- [x] buildPlan signature: `buildPlan(current, ideal)` - pure function, returns Plan directly
- [x] gitTreeHash in lockfile: Required for git sources (no explicit version info)
- [x] Install path: Computed on demand via `computeInstallPath`, not stored
- [x] Agent resolution: Handler resolves agents before buildIdealState
- [x] Settings entries: Derived from plan steps; SkillSettingsEntry union type
- [x] collectIssues: Pure helper function defined
- [x] UnhealthyWorkspaceError: Added to error types
- [x] LockedSkill: Defined with agents field for tracking per-skill agent installations
- [x] Uninstall semantics: Removes from specified agents + canonical location + settings + lockfile
- [x] Uninstall scope: Requires both actual (on disk) and locked (in lockfile); "locked but not on disk" is a health issue
- [x] No repair concept: Simplified to install/update/uninstall only
- [x] Version comparison: Semver for registry sources, hash for git sources
- [x] Array for CurrentState.skills: Required to detect duplicate skill names (O(n) tradeoff accepted)
- [x] Skill identity: Name-based (unique across all sources); rejects duplicates from different sources
- [x] External state (registries): Fetched during `buildIdealState`; version/metadata captured in `IdealSkill`
- [x] Error recovery: On apply failure, stop and return partial `ApplyResult`; lockfile only updated on full success
- [x] SkillFrontmatter: Type defined with name, description, version, triggers fields
- [x] Registry settings: Deferred; only GitHub and Local variants for now
- [x] Progress reporting: Optional `onProgress` callback in ApplyOptions; UI is handler responsibility
- [x] Partial apply rollback: No automatic rollback; orphaned files detected by doctor
