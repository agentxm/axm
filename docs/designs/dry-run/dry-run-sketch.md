# Dry-Run Capability: State-Based Architecture

## Executive Summary

This document describes a state-based architecture for dry-run functionality, inspired by npm's Arborist library. Rather than generating an operation log, we model three states:

- **Actual** — What's on disk
- **Locked** — What the lockfile says
- **Ideal** — Desired state after the operation

The diff between current (actual + locked) and ideal produces the plan. Dry-run displays the plan without applying it.

---

## Current Install Flow (8 Steps)

1. **Parse Source** — Resolve `github:owner/repo`, local path, or well-known URL
2. **Ensure Initialized** — Create `.axm/` directory if missing
3. **Detect/Select Agents** — Find installed agents (Claude Code, Cursor, etc.)
4. **Discover Skills** — Clone/fetch source, find SKILL.md files
5. **List Mode** — If `--list`, display skills and exit (already read-only)
6. **Select Skills** — Interactive or via `--skill`/`--all` flags
7. **Conflict Detection** — Check lockfile for existing installations
8. **Install & Update** — Copy files, create symlinks, update metadata

---

## Why Dry-Run Matters

1. **Fast Smoke Testing** — Verify install logic without file system changes
2. **CI/CD Safety** — Test installation in pipelines without side effects
3. **User Confidence** — Show exactly what will happen before committing
4. **Debugging** — Trace installation flow without cleanup burden
5. **Idempotency Checks** — Verify what would change on re-run
6. **Validation Reuse** — Same state model powers `doctor` and `validate`

---

## Architecture: State Diffing

### Core Insight: Three States

```
┌─────────────────┐     ┌─────────────────┐
│  ActualSkill    │     │  LockedSkill    │
│  (disk scan)    │     │  (lockfile)     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │ merge + validate
                     ▼
              ┌──────────────┐
              │  SkillState  │
              │  - actual    │
              │  - locked    │
              │  - validity  │
              └──────────────┘
                     │
                     │ build ideal for operation
                     ▼
              ┌──────────────┐
              │  IdealSkill  │
              │  - source    │
              │  - hash      │
              └──────────────┘
                     │
                     │ compute diff
                     ▼
              ┌──────────────┐
              │  SkillsDiff  │
              │  - changes   │  ← The "plan"
              │  - summary   │
              └──────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    [dry-run]               [apply]
    display only            execute changes
```

### Benefits Over Operation Log

| Aspect          | Operation Log             | State Diffing                         |
| --------------- | ------------------------- | ------------------------------------- |
| Validation      | Separate concern          | Built into state model                |
| Idempotency     | Must check each operation | Natural: actual === ideal means no-op |
| Doctor/validate | Separate implementation   | Reuses SkillValidity                  |
| Sync command    | Must generate ops         | "Make actual match locked"            |
| Mental model    | "List of things to do"    | "Current vs desired"                  |

---

## Type Definitions

### Per-Extension-Type Design

Each extension type (skill, command, pack, mcp) has its own state types with type-specific validation.

**Locked types** derive from the shared `LockEntry` schema using Effect Schema transformations. This gives us one source of truth for both serialization and domain representation:

```typescript
// Shared pattern
interface StateBase<TActual, TLocked, TValidity> {
  readonly name: string;
  readonly actual: Option.Option<TActual>;
  readonly locked: Option.Option<TLocked>;
  readonly validity: TValidity;
}

// Locked types derived from LockEntry schema with transformations
// Schema handles: string ↔ Date, optional ↔ Option
const LockedSkill = LockEntry.pipe(Schema.transform(...));
type LockedSkill = typeof LockedSkill.Type;

// Per-type implementations
interface SkillState extends StateBase<
  ActualSkill,
  LockedSkill,
  SkillValidity
> {}
interface CommandState extends StateBase<
  ActualCommand,
  LockedCommand,
  CommandValidity
> {}
interface McpState extends StateBase<ActualMcp, LockedMcp, McpValidity> {}
interface PackState extends StateBase<ActualPack, LockedPack, PackValidity> {}
```

### Skill Types (Reference Implementation)

```typescript
// packages/core/src/skills/state/types.ts

import { Data, Option, Schema } from "effect";
import { FullyQualifiedName } from "@agentxm/core/schemas";

// =============================================================================
// Actual State (what's on disk)
// =============================================================================

/**
 * Skill as it exists on disk at canonical location (.axm/skills/<name>/).
 */
export interface ActualSkill {
  readonly name: string;
  readonly path: string;
  readonly frontmatter: Option.Option<SkillFrontmatter>;
  readonly content: string;
  readonly folderHash: string;
  readonly files: readonly string[];
  readonly lastModified: Date;
}

export interface SkillFrontmatter {
  readonly name?: string;
  readonly description?: string;
  readonly version?: string;
  readonly triggers?: readonly string[];
}

// =============================================================================
// Locked State (what the lockfile says)
// =============================================================================

/**
 * Skill entry from axm-lock.yaml.
 *
 * Derived from the LockEntry schema with Effect Schema transformations.
 * The schema handles string ↔ Date and optional ↔ Option conversions.
 */
export const LockedSkill = Schema.Struct({
  source: Schema.String,
  origin: Schema.String,
  path: Schema.optionalToOption(Schema.String),
  ref: Schema.optionalToOption(Schema.String),
  version: Schema.optionalToOption(Schema.String),
  folderHash: Schema.String,
  dependencies: Schema.optionalToOption(Schema.Array(FullyQualifiedName)),
  installedAt: Schema.Date,
  updatedAt: Schema.Date,
});

export type LockedSkill = typeof LockedSkill.Type;
// Encoded form for serialization: { path?: string, installedAt: string, ... }

// =============================================================================
// Validity (type-specific diagnostics)
// =============================================================================

/**
 * Skill validity states. Each extension type defines its own validity union.
 */
export type SkillValidity = Data.TaggedEnum<{
  Valid: {};
  MissingSkillMd: { path: string };
  InvalidFrontmatter: { errors: readonly string[] };
  NameMismatch: { frontmatterName: string; directoryName: string };
  MissingDescription: {}; // warning level
  Orphaned: {}; // on disk, not in lockfile
  Missing: { expected: LockedSkill }; // in lockfile, not on disk
  HashMismatch: { expected: string; actual: string };
  Incomplete: { reason: string };
  Multiple: { issues: readonly SkillValidity[] };
}>;

export const SkillValidity = Data.taggedEnum<SkillValidity>();

export type ValiditySeverity = "error" | "warning" | "info";

export const getValiditySeverity = (v: SkillValidity): ValiditySeverity =>
  SkillValidity.$match(v, {
    Valid: () => "info",
    MissingDescription: () => "warning",
    Orphaned: () => "warning",
    HashMismatch: () => "warning",
    MissingSkillMd: () => "error",
    InvalidFrontmatter: () => "error",
    NameMismatch: () => "error",
    Missing: () => "error",
    Incomplete: () => "error",
    Multiple: ({ issues }) =>
      issues.some((i) => getValiditySeverity(i) === "error")
        ? "error"
        : issues.some((i) => getValiditySeverity(i) === "warning")
          ? "warning"
          : "info",
  });

// =============================================================================
// Unified State
// =============================================================================

/**
 * Complete state of a skill: actual + locked + computed validity.
 */
export interface SkillState {
  readonly name: string;
  readonly actual: Option.Option<ActualSkill>;
  readonly locked: Option.Option<LockedSkill>;
  readonly validity: SkillValidity;
}

export interface SkillsState {
  readonly skills: ReadonlyMap<string, SkillState>;
}

// =============================================================================
// Settings State (settings.json)
// =============================================================================

import { Settings } from "@agentxm/core/schemas";

/**
 * Settings state reuses the Settings schema directly.
 * Actual = parsed Settings from disk. Ideal = desired Settings.
 */
export interface SettingsState {
  readonly path: string;
  readonly actual: Option.Option<Settings>; // None if file doesn't exist
  readonly lastModified: Option.Option<Date>;
  readonly validity: SettingsValidity;
}

export type SettingsValidity = Data.TaggedEnum<{
  Valid: {};
  ParseError: { error: string };
  SchemaMismatch: { errors: readonly string[] };
  OrphanedSkills: { names: readonly string[] }; // skills in settings but not installed
  OrphanedCommands: { names: readonly string[] };
  Multiple: { issues: readonly SettingsValidity[] };
}>;

export const SettingsValidity = Data.taggedEnum<SettingsValidity>();

// IdealSettings is just Settings - what we want settings.json to become
type IdealSettings = Settings;

// =============================================================================
// Project Workspace State (top-level container)
// =============================================================================

/**
 * Complete state of an axm project workspace.
 * Aggregates all extension states and settings.
 */
export interface WorkspaceState {
  readonly axmDir: string;
  readonly skills: SkillsState;
  readonly commands: CommandsState;
  readonly mcpServers: McpServersState;
  readonly packs: PacksState;
  readonly settings: SettingsState;
  readonly loadedAt: Date;
}

// =============================================================================
// Ideal State (desired after operation)
// =============================================================================

export interface IdealSkill {
  readonly name: string;
  readonly source: SkillSource;
  readonly folderHash: string;
  readonly description: Option.Option<string>;
  readonly agents: readonly string[];
}

export type SkillSource = Data.TaggedEnum<{
  Local: { path: string };
  Git: {
    url: string;
    ref: Option.Option<string>;
    subpath: Option.Option<string>;
  };
  WellKnown: { baseUrl: string; skillName: string };
  Registry: { name: string; version: string };
}>;

export const SkillSource = Data.taggedEnum<SkillSource>();

export interface IdealSkillsState {
  readonly skills: ReadonlyMap<string, IdealSkill>;
  readonly removals: ReadonlySet<string>;
}

/**
 * Complete ideal state for a project workspace.
 * IdealSettings = Settings (reuses schema directly).
 */
export interface IdealWorkspaceState {
  readonly skills: IdealSkillsState;
  readonly commands: IdealCommandsState;
  readonly mcpServers: IdealMcpServersState;
  readonly packs: IdealPacksState;
  readonly settings: Settings; // Ideal settings = Settings schema
}

// =============================================================================
// Diff / Plan
// =============================================================================

export type SkillChange = Data.TaggedEnum<{
  Add: { skill: IdealSkill };
  Update: { from: SkillState; to: IdealSkill };
  Remove: { skill: SkillState };
  Unchanged: { skill: SkillState };
  Repair: { skill: SkillState; target: IdealSkill };
}>;

export const SkillChange = Data.taggedEnum<SkillChange>();

export interface SkillsDiff {
  readonly changes: ReadonlyMap<string, SkillChange>;
  readonly summary: {
    readonly add: number;
    readonly update: number;
    readonly remove: number;
    readonly unchanged: number;
    readonly repair: number;
  };
}

// =============================================================================
// Agent Sync (computed separately)
// =============================================================================

export type AgentSyncStatus = Data.TaggedEnum<{
  Synced: { method: "symlink" | "copy" };
  Missing: {};
  Stale: { expected: string; actual: string };
  BrokenSymlink: { link: string; target: string };
}>;

export const AgentSyncStatus = Data.taggedEnum<AgentSyncStatus>();

export interface SkillSyncState {
  readonly skillName: string;
  readonly canonicalPath: string;
  readonly agents: ReadonlyMap<string, AgentSyncStatus>;
}
```

---

## State Loading

```typescript
// packages/core/src/skills/state/load.ts

import { Effect, Option } from "effect";
import type { FileSystem } from "@effect/platform";

/**
 * Load complete skills state: actual + locked + computed validity.
 */
export const loadSkillsState = (
  axmDir: string,
): Effect.Effect<SkillsState, LoadError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // Load actual and locked in parallel
    const [actualMap, lockedMap] = yield* Effect.all([
      loadActualSkills(axmDir),
      loadLockedSkills(axmDir),
    ]);

    // Merge keys from both maps
    const allNames = new Set([...actualMap.keys(), ...lockedMap.keys()]);
    const skills = new Map<string, SkillState>();

    for (const name of allNames) {
      const actual = Option.fromNullable(actualMap.get(name));
      const locked = Option.fromNullable(lockedMap.get(name));
      const validity = computeValidity(actual, locked);
      skills.set(name, { name, actual, locked, validity });
    }

    return { skills, axmDir, loadedAt: new Date() };
  });

/**
 * Compute validity by comparing actual vs locked state.
 */
const computeValidity = (
  actual: Option.Option<ActualSkill>,
  locked: Option.Option<LockedSkill>,
): SkillValidity => {
  // Neither exists
  if (Option.isNone(actual) && Option.isNone(locked)) {
    return SkillValidity.Valid({});
  }

  // Orphaned (on disk, not in lockfile)
  if (Option.isSome(actual) && Option.isNone(locked)) {
    return SkillValidity.Orphaned({});
  }

  // Missing (in lockfile, not on disk)
  if (Option.isNone(actual) && Option.isSome(locked)) {
    return SkillValidity.Missing({ expected: locked.value });
  }

  // Both exist - compare
  const a = actual.value;
  const l = locked.value;
  const issues: SkillValidity[] = [];

  if (a.content === "") {
    issues.push(SkillValidity.MissingSkillMd({ path: `${a.path}/SKILL.md` }));
  }

  if (Option.isNone(a.frontmatter) && a.content !== "") {
    issues.push(
      SkillValidity.InvalidFrontmatter({ errors: ["Failed to parse"] }),
    );
  }

  if (Option.isSome(a.frontmatter)) {
    const fm = a.frontmatter.value;
    if (fm.name && fm.name !== a.name) {
      issues.push(
        SkillValidity.NameMismatch({
          frontmatterName: fm.name,
          directoryName: a.name,
        }),
      );
    }
    if (!fm.description) {
      issues.push(SkillValidity.MissingDescription({}));
    }
  }

  if (a.folderHash !== l.folderHash) {
    issues.push(
      SkillValidity.HashMismatch({
        expected: l.folderHash,
        actual: a.folderHash,
      }),
    );
  }

  if (issues.length === 0) return SkillValidity.Valid({});
  if (issues.length === 1) return issues[0];
  return SkillValidity.Multiple({ issues });
};
```

---

## Ideal State Builders

Each operation builds the ideal state differently:

```typescript
// packages/core/src/skills/state/ideal.ts

/**
 * Build ideal state for install operation.
 */
export const buildIdealForInstall = (
  current: SkillsState,
  source: ResolvedSource,
  options: InstallOptions,
): Effect.Effect<
  IdealSkillsState,
  BuildIdealError,
  FileSystem.FileSystem | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    // Discover skills from source
    const discovered = yield* discoverSkillsFromSource(source);

    // Filter by --skill flag
    const filtered =
      options.skills.length > 0
        ? discovered.filter((s) => options.skills.includes(s.name))
        : discovered;

    // Build ideal: keep existing + add new
    const idealSkills = new Map<string, IdealSkill>();

    // Keep existing valid skills
    for (const [name, state] of current.skills) {
      if (Option.isSome(state.actual) && Option.isSome(state.locked)) {
        idealSkills.set(name, stateToIdeal(state));
      }
    }

    // Add/update from source
    for (const skill of filtered) {
      const existing = current.skills.get(skill.name);
      if (existing && Option.isSome(existing.actual) && !options.force) {
        continue; // Skip existing unless force
      }
      idealSkills.set(skill.name, skill);
    }

    return { skills: idealSkills, removals: new Set() };
  });

/**
 * Build ideal state for update operation.
 */
export const buildIdealForUpdate = (
  current: SkillsState,
  options: UpdateOptions,
  skillNames?: readonly string[],
): Effect.Effect<
  IdealSkillsState,
  BuildIdealError,
  FileSystem.FileSystem | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const idealSkills = new Map<string, IdealSkill>();

    for (const [name, state] of current.skills) {
      if (Option.isNone(state.locked)) continue;

      const shouldUpdate = !skillNames || skillNames.includes(name);

      if (shouldUpdate) {
        const latest = yield* fetchLatestVersion(state.locked.value);
        idealSkills.set(name, latest);
      } else {
        idealSkills.set(name, stateToIdeal(state));
      }
    }

    return { skills: idealSkills, removals: new Set() };
  });

/**
 * Build ideal state for uninstall operation.
 */
export const buildIdealForUninstall = (
  current: SkillsState,
  skillNames: readonly string[],
): Effect.Effect<IdealSkillsState, BuildIdealError, never> =>
  Effect.gen(function* () {
    const idealSkills = new Map<string, IdealSkill>();
    const removals = new Set<string>();

    for (const [name, state] of current.skills) {
      if (skillNames.includes(name)) {
        removals.add(name);
      } else if (Option.isSome(state.locked)) {
        idealSkills.set(name, stateToIdeal(state));
      }
    }

    return { skills: idealSkills, removals };
  });

/**
 * Build ideal state for sync operation (repair drift).
 */
export const buildIdealForSync = (
  current: SkillsState,
): Effect.Effect<IdealSkillsState, BuildIdealError, never> =>
  Effect.gen(function* () {
    const idealSkills = new Map<string, IdealSkill>();
    const removals = new Set<string>();

    for (const [name, state] of current.skills) {
      if (Option.isSome(state.locked)) {
        idealSkills.set(name, stateToIdeal(state));
      } else if (Option.isSome(state.actual)) {
        removals.add(name); // Orphaned
      }
    }

    return { skills: idealSkills, removals };
  });
```

---

## Diff Computation

```typescript
// packages/core/src/skills/state/diff.ts

/**
 * Compute diff between current and ideal state.
 * This is the "plan" displayed in dry-run and executed in apply.
 */
export const computeDiff = (
  current: SkillsState,
  ideal: IdealSkillsState,
): SkillsDiff => {
  const changes = new Map<string, SkillChange>();
  let add = 0,
    update = 0,
    remove = 0,
    unchanged = 0,
    repair = 0;

  // Process removals
  for (const name of ideal.removals) {
    const state = current.skills.get(name);
    if (state && Option.isSome(state.actual)) {
      changes.set(name, SkillChange.Remove({ skill: state }));
      remove++;
    }
  }

  // Process ideal skills
  for (const [name, idealSkill] of ideal.skills) {
    const currentState = current.skills.get(name);

    // Not installed -> Add
    if (!currentState || Option.isNone(currentState.actual)) {
      changes.set(name, SkillChange.Add({ skill: idealSkill }));
      add++;
      continue;
    }

    // Invalid state -> Repair
    const needsRepair =
      !SkillValidity.$is("Valid")(currentState.validity) &&
      !SkillValidity.$is("MissingDescription")(currentState.validity) &&
      !SkillValidity.$is("HashMismatch")(currentState.validity);

    if (needsRepair) {
      changes.set(
        name,
        SkillChange.Repair({ skill: currentState, target: idealSkill }),
      );
      repair++;
      continue;
    }

    // Hash differs -> Update
    if (currentState.actual.value.folderHash !== idealSkill.folderHash) {
      changes.set(
        name,
        SkillChange.Update({ from: currentState, to: idealSkill }),
      );
      update++;
      continue;
    }

    // Unchanged
    changes.set(name, SkillChange.Unchanged({ skill: currentState }));
    unchanged++;
  }

  return { changes, summary: { add, update, remove, unchanged, repair } };
};

export const hasChanges = (diff: SkillsDiff): boolean =>
  diff.summary.add > 0 ||
  diff.summary.update > 0 ||
  diff.summary.remove > 0 ||
  diff.summary.repair > 0;
```

---

## Apply Phase

```typescript
// packages/core/src/skills/state/apply.ts

export interface ApplyResult {
  readonly applied: ReadonlyMap<string, AppliedChange>;
  readonly failed: ReadonlyMap<string, ApplyError>;
  readonly summary: {
    readonly added: number;
    readonly updated: number;
    readonly removed: number;
    readonly repaired: number;
    readonly failed: number;
  };
}

export interface ApplyOptions {
  readonly axmDir: string;
  readonly agents: readonly AgentConfig[];
  readonly onProgress?: (event: ApplyProgressEvent) => void;
}

/**
 * Apply diff to make actual state match ideal state.
 */
export const applyDiff = (
  diff: SkillsDiff,
  options: ApplyOptions,
): Effect.Effect<ApplyResult, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const applied = new Map<string, AppliedChange>();
    const failed = new Map<string, ApplyError>();
    let added = 0,
      updated = 0,
      removed = 0,
      repaired = 0;

    for (const [name, change] of diff.changes) {
      if (SkillChange.$is("Unchanged")(change)) continue;

      const result = yield* pipe(applyChange(change, options), Effect.either);

      if (result._tag === "Right") {
        applied.set(name, result.right);
        switch (result.right.type) {
          case "add":
            added++;
            break;
          case "update":
            updated++;
            break;
          case "remove":
            removed++;
            break;
          case "repair":
            repaired++;
            break;
        }
      } else {
        failed.set(name, result.left);
      }
    }

    // Update lockfile after all changes
    if (applied.size > 0) {
      yield* updateLockfile(options.axmDir, diff, applied);
    }

    return {
      applied,
      failed,
      summary: { added, updated, removed, repaired, failed: failed.size },
    };
  });

const applyChange = (
  change: SkillChange,
  options: ApplyOptions,
): Effect.Effect<
  AppliedChange,
  ApplyError,
  FileSystem.FileSystem | Path.Path
> =>
  SkillChange.$match(change, {
    Add: ({ skill }) => applyAdd(skill, options),
    Update: ({ from, to }) => applyUpdate(from, to, options),
    Remove: ({ skill }) => applyRemove(skill, options),
    Repair: ({ skill, target }) => applyRepair(skill, target, options),
    Unchanged: () => Effect.die("Unchanged should not be applied"),
  });

const applyAdd = (
  skill: IdealSkill,
  options: ApplyOptions,
): Effect.Effect<
  AppliedChange,
  ApplyError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const canonicalPath = `${options.axmDir}/skills/${skill.name}`;

    // 1. Fetch source to temp
    const tempPath = yield* fetchSource(skill.source, skill.name);

    // 2. Copy to canonical location
    yield* copyToCanonical(tempPath, canonicalPath, skill.name);

    // 3. Sync to agents
    const syncedAgents = yield* syncToAgents(
      canonicalPath,
      skill.name,
      options.agents,
    );

    // 4. Cleanup temp
    yield* cleanupTemp(tempPath);

    return {
      name: skill.name,
      type: "add" as const,
      agentsSynced: syncedAgents,
    };
  });

// Update, Remove, Repair follow similar patterns...
```

---

## Handler Integration

```typescript
// packages/cli/src/commands/skills/install/handler.ts

export const handleInstall = (args: InstallArgs) =>
  Effect.gen(function* () {
    const axmDir = getAxmDir(args.global);
    const agents = yield* resolveAgents(args);

    p.intro("axm skills install");

    // Phase 1: Load current state
    const spinner = p.spinner();
    spinner.start("Analyzing project...");
    const current = yield* loadSkillsState(axmDir);
    spinner.stop(`Found ${current.skills.size} installed skill(s)`);

    // Phase 2: Resolve source and build ideal
    spinner.start("Resolving source...");
    const source = yield* resolveSource(args.source);
    const ideal = yield* buildIdealForInstall(current, source, {
      global: args.global,
      agents: args.agent,
      force: args.force,
      skills: args.skill,
      all: args.all,
    });

    // Phase 3: Compute diff (the plan)
    const diff = computeDiff(current, ideal);
    spinner.stop("Plan ready");

    // Phase 4: Display (same for dry-run and real)
    displayDiff(diff);

    // Phase 5: Dry-run exits here
    if (args.dryRun) {
      p.outro("Dry-run complete. No changes made.");
      return;
    }

    // Phase 6: Nothing to do?
    if (!hasChanges(diff)) {
      p.outro("Already up to date.");
      return;
    }

    // Phase 7: Confirm
    if (!args.yes) {
      const confirmed = yield* promptConfirm(`Apply changes?`);
      if (!confirmed) {
        p.cancel("Cancelled.");
        return;
      }
    }

    // Phase 8: Apply
    spinner.start("Installing...");
    const result = yield* applyDiff(diff, { axmDir, agents });
    spinner.stop(
      `Applied ${result.summary.added + result.summary.updated} change(s)`,
    );

    // Phase 9: Report failures
    if (result.failed.size > 0) {
      for (const [name, error] of result.failed) {
        p.log.error(`Failed: ${name} - ${error.message}`);
      }
    }

    p.outro(`Installed ${result.summary.added} skill(s)`);
  });
```

---

## Unified Validation

The state model naturally supports `doctor` and `validate`:

```typescript
// packages/cli/src/commands/doctor/handler.ts

export const handleDoctor = () =>
  Effect.gen(function* () {
    const axmDir = yield* findAxmDir();
    const current = yield* loadSkillsState(axmDir);

    let errors = 0;
    let warnings = 0;

    for (const [name, state] of current.skills) {
      const severity = getValiditySeverity(state.validity);

      if (severity === "error") {
        p.log.error(`${name}: ${describeValidity(state.validity)}`);
        errors++;
      } else if (severity === "warning") {
        p.log.warn(`${name}: ${describeValidity(state.validity)}`);
        warnings++;
      }
    }

    // Also check agent sync status
    const syncStates = yield* loadAgentSyncStates(axmDir);
    for (const sync of syncStates) {
      for (const [agentId, status] of sync.agents) {
        if (AgentSyncStatus.$is("BrokenSymlink")(status)) {
          p.log.error(`${sync.skillName}: Broken symlink to ${agentId}`);
          errors++;
        }
      }
    }

    if (errors === 0 && warnings === 0) {
      p.log.success("No issues found");
    } else {
      p.log.info(`${errors} error(s), ${warnings} warning(s)`);
    }
  });
```

---

## Testing Strategy

### Unit Tests: State Loading

```typescript
describe("loadSkillsState", () => {
  it("detects orphaned skills", async () => {
    // Skill on disk but not in lockfile
    const state = await Effect.runPromise(
      loadSkillsState("/test/.axm").pipe(
        Effect.provide(TestLayerWithOrphanedSkill),
      ),
    );

    const skill = state.skills.get("orphaned-skill");
    expect(SkillValidity.$is("Orphaned")(skill.validity)).toBe(true);
  });

  it("detects missing skills", async () => {
    // Skill in lockfile but not on disk
    const state = await Effect.runPromise(
      loadSkillsState("/test/.axm").pipe(
        Effect.provide(TestLayerWithMissingSkill),
      ),
    );

    const skill = state.skills.get("missing-skill");
    expect(SkillValidity.$is("Missing")(skill.validity)).toBe(true);
  });

  it("detects hash mismatch", async () => {
    const state = await Effect.runPromise(
      loadSkillsState("/test/.axm").pipe(
        Effect.provide(TestLayerWithModifiedSkill),
      ),
    );

    const skill = state.skills.get("modified-skill");
    expect(SkillValidity.$is("HashMismatch")(skill.validity)).toBe(true);
  });
});
```

### Unit Tests: Diff Computation

```typescript
describe("computeDiff", () => {
  it("identifies additions", () => {
    const current: SkillsState = {
      skills: new Map(),
      axmDir: "/test",
      loadedAt: new Date(),
    };
    const ideal: IdealSkillsState = {
      skills: new Map([["new-skill", mockIdealSkill("new-skill")]]),
      removals: new Set(),
    };

    const diff = computeDiff(current, ideal);

    expect(diff.summary.add).toBe(1);
    expect(SkillChange.$is("Add")(diff.changes.get("new-skill"))).toBe(true);
  });

  it("identifies no changes when actual matches ideal", () => {
    const current = mockCurrentStateWithSkill("existing");
    const ideal = mockIdealStateWithSkill(
      "existing",
      current.skills.get("existing")!,
    );

    const diff = computeDiff(current, ideal);

    expect(hasChanges(diff)).toBe(false);
    expect(diff.summary.unchanged).toBe(1);
  });
});
```

### Integration Tests

```typescript
describe("axm skills install --dry-run", () => {
  it("shows plan without making changes", async () => {
    const result = await runCLI([
      "skills",
      "install",
      "./fixtures/skills",
      "--dry-run",
      "--all",
      "--yes",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dry-run complete");
    expect(result.stdout).toContain("to add");

    // Verify no actual changes
    expect(await fs.exists(".axm/skills/commit")).toBe(false);
  });

  it("dry-run matches real install", async () => {
    // Get dry-run plan
    const dryResult = await runCLI([
      "skills",
      "install",
      "./fixtures/skills",
      "--dry-run",
      "--all",
      "--yes",
      "--json",
    ]);
    const plan = JSON.parse(dryResult.stdout);

    // Real install
    await runCLI(["skills", "install", "./fixtures/skills", "--all", "--yes"]);

    // Verify same skills installed
    const installed = await getInstalledSkills(".axm");
    expect(installed.sort()).toEqual(
      plan.changes
        .filter((c) => c.type === "add")
        .map((c) => c.name)
        .sort(),
    );
  });
});
```

---

## Extension to Other Commands

| Command     | Ideal Builder            | Behavior                     |
| ----------- | ------------------------ | ---------------------------- |
| `install`   | `buildIdealForInstall`   | Add new skills to ideal      |
| `update`    | `buildIdealForUpdate`    | Replace with latest versions |
| `uninstall` | `buildIdealForUninstall` | Remove from ideal            |
| `sync`      | `buildIdealForSync`      | Make actual match locked     |
| `prune`     | `buildIdealForPrune`     | Remove orphaned from ideal   |

Same `computeDiff` and `applyDiff` for all operations.

---

## Migration Path

| Phase                       | Scope                                 | Breaking? |
| --------------------------- | ------------------------------------- | --------- |
| 1. Define types             | New module `state/types.ts`           | No        |
| 2. Implement loading        | `loadWorkspaceState`                  | No        |
| 3. Implement ideal builders | Per-operation builders                | No        |
| 4. Implement diff           | `computeDiff`                         | No        |
| 5. Implement apply          | `applyDiff` (extensions + settings)   | No        |
| 6. Add `--dry-run` flag     | Feature flag, old handler still works | No        |
| 7. Switch handler           | Handler uses new state model          | Internal  |
| 8. Extend to other types    | Commands, MCPs, Packs                 | Per-type  |

---

## Decision Record

| Decision            | Choice                                  | Rationale                                                              |
| ------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| Architecture        | State diffing (Arborist-style)          | Unified validation, natural idempotency, reusable for doctor/sync      |
| State separation    | actual + locked → merged with validity  | Clear provenance, supports all comparison scenarios                    |
| Per-type state      | SkillState, CommandState, etc.          | Type-specific validation, manifests, behaviors                         |
| Locked types        | Derived from LockEntry via Schema       | One source of truth; Schema handles string↔Date, optional↔Option       |
| Top-level container | WorkspaceState                          | Aggregates all extension states + settings for unified operations      |
| Settings state      | Reuses Settings schema for actual/ideal | One source of truth; operations may modify skills, commands, etc.      |
| Agent sync          | Separate from extension state           | Avoids N×M complexity, computed on demand                              |
| Validity            | Tagged union with payloads              | Actionable errors, supports multiple issues                            |
| Diff as plan        | SkillChange tagged union                | Same display for dry-run and execution                                 |
| Apply phase         | Idempotent operations                   | Re-run fixes partial failures                                          |
| Discovery effects   | Allow git clone with messaging          | Cache population needed for accurate plan; messaging sets expectations |
| JSON output         | Serialize SkillsDiff directly           | Simple, complete, matches internal model                               |
| Parallel apply      | Parallel file ops, sequential lockfile  | Maximizes throughput while ensuring lockfile consistency               |

---

## Open Questions

### Resolved

1. **State model**: Arborist-style with actual/locked/ideal ✓
2. **Per-type state**: Yes, each extension type has own types ✓
3. **Agent sync**: Separate concern, computed on demand ✓
4. **Validity**: Tagged union with severity levels ✓
5. **Locked types**: Derived from LockEntry schema via Effect Schema transformations ✓
6. **Top-level container**: WorkspaceState aggregates all extension states + settings ✓
7. **Settings state**: Reuses existing Settings schema for actual/ideal; no separate types ✓
8. **Discovery side effects**: Dry-run allows git clone to populate cache, with clear messaging ✓
9. **JSON output**: Serialize SkillsDiff directly for `--json` flag ✓
10. **Parallel apply**: Yes for file operations, sequential for lockfile update ✓

### Future Work

11. **Type-specific lock entries**: The current `LockEntry` schema is generic across all extension types. May need type-specific schemas (e.g., `SkillLockEntry`, `CommandLockEntry`) if extension types diverge in their lockfile fields (triggers for skills, aliases for commands, etc.).
