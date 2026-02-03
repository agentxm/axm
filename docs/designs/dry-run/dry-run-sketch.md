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

### Design Principle: Effect Schemas Throughout

All types are defined as Effect Schemas (not plain interfaces) to enable:

1. **JSON serialization** — `--json` flag outputs valid JSON that can be parsed back
2. **Test deserialization** — E2E tests can parse CLI output and assert on structured data
3. **Runtime validation** — Schema.decodeUnknown validates data at boundaries
4. **Single source of truth** — Type and validation logic colocated

```typescript
// Pattern: Define as Schema, derive Type
const MyType = Schema.Struct({
  name: Schema.String,
  value: Schema.Number,
});
type MyType = typeof MyType.Type;

// For tagged unions, use Schema.TaggedStruct
const MyChange = Schema.Union(
  Schema.TaggedStruct("Add", { item: ItemSchema }),
  Schema.TaggedStruct("Remove", { name: Schema.String }),
);
type MyChange = typeof MyChange.Type;
```

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

> **Note**: This document uses Skills as the reference implementation. The same patterns apply to Commands, MCP Servers, and Packs. Skills will be implemented first, then other extension types will follow the established patterns.

```typescript
// packages/core/src/skills/state/types.ts

import { Data, Option, Schema } from "effect";
import { FullyQualifiedName } from "@agentxm/core/schemas";

// =============================================================================
// Actual State (what's on disk)
// =============================================================================

export const SkillFrontmatter = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  triggers: Schema.optional(Schema.Array(Schema.String)),
});
export type SkillFrontmatter = typeof SkillFrontmatter.Type;

/**
 * Skill as it exists on disk at canonical location (.axm/skills/<name>/).
 */
export const ActualSkill = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  frontmatter: Schema.OptionFromNullOr(SkillFrontmatter),
  content: Schema.String,
  folderHash: Schema.String,
  files: Schema.Array(Schema.String),
  lastModified: Schema.Date,
});
export type ActualSkill = typeof ActualSkill.Type;

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
 * Validity codes for stable identification in docs, automation, and suppression.
 * Prefix determines severity: E = error, W = warning.
 *
 * Skills:
 *   E001: MissingSkillMd - SKILL.md file not found
 *   E002: InvalidFrontmatter - Frontmatter failed to parse
 *   E003: NameMismatch - Frontmatter name differs from directory name
 *   E004: Missing - In lockfile but not on disk
 *   E005: HashMismatch - Disk contents differ from lockfile hash
 *   E006: Incomplete - Partially installed (missing files)
 *   W001: MissingDescription - No description in frontmatter
 *   W002: Orphaned - On disk but not in lockfile
 */
export const SkillValidityCode = Schema.Literal(
  "E001",
  "E002",
  "E003",
  "E004",
  "E005",
  "E006",
  "W001",
  "W002",
);
export type SkillValidityCode = typeof SkillValidityCode.Type;

/**
 * Skill validity states as Schema for JSON serialization.
 * Each variant has a static code for identification.
 * Severity derived from code prefix: E = error, W = warning.
 */
export const SkillValidity: Schema.Schema<SkillValidity> = Schema.Union(
  Schema.TaggedStruct("Valid", {}),
  Schema.TaggedStruct("MissingSkillMd", {
    code: Schema.Literal("E001"),
    path: Schema.String,
  }),
  Schema.TaggedStruct("InvalidFrontmatter", {
    code: Schema.Literal("E002"),
    errors: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct("NameMismatch", {
    code: Schema.Literal("E003"),
    frontmatterName: Schema.String,
    directoryName: Schema.String,
  }),
  Schema.TaggedStruct("MissingDescription", { code: Schema.Literal("W001") }),
  Schema.TaggedStruct("Orphaned", { code: Schema.Literal("W002") }),
  Schema.TaggedStruct("Missing", {
    code: Schema.Literal("E004"),
    expected: LockedSkill,
  }),
  Schema.TaggedStruct("HashMismatch", {
    code: Schema.Literal("E005"),
    expected: Schema.String,
    actual: Schema.String,
  }),
  Schema.TaggedStruct("Incomplete", {
    code: Schema.Literal("E006"),
    reason: Schema.String,
  }),
  Schema.TaggedStruct("Multiple", {
    issues: Schema.Array(Schema.suspend(() => SkillValidity)),
  }),
);
export type SkillValidity = typeof SkillValidity.Type;

export const ValiditySeverity = Schema.Literal("error", "warning", "info");
export type ValiditySeverity = typeof ValiditySeverity.Type;

/** Derive severity from validity code prefix. */
export const severityFromCode = (code: SkillValidityCode): ValiditySeverity =>
  code.startsWith("E") ? "error" : code.startsWith("W") ? "warning" : "info";

/** Extract code from validity (Valid has no code). */
export const getValidityCode = (v: SkillValidity): SkillValidityCode | null =>
  SkillValidity.$match(v, {
    Valid: () => null,
    MissingSkillMd: ({ code }) => code,
    InvalidFrontmatter: ({ code }) => code,
    NameMismatch: ({ code }) => code,
    MissingDescription: ({ code }) => code,
    Orphaned: ({ code }) => code,
    Missing: ({ code }) => code,
    HashMismatch: ({ code }) => code,
    Incomplete: ({ code }) => code,
    Multiple: ({ issues }) => getValidityCode(issues[0]), // Return first issue's code
  });

// =============================================================================
// Unified State
// =============================================================================

/**
 * Complete state of a skill: actual + locked + computed validity.
 */
export const SkillState = Schema.Struct({
  name: Schema.String,
  actual: Schema.OptionFromNullOr(ActualSkill),
  locked: Schema.OptionFromNullOr(LockedSkill),
  validity: SkillValidity,
});
export type SkillState = typeof SkillState.Type;

// Skills stored as Record for O(1) lookups and immutable updates
export const SkillsState = Schema.Struct({
  skills: Schema.Record({ key: Schema.String, value: SkillState }),
});
export type SkillsState = typeof SkillsState.Type;

// =============================================================================
// Settings State (settings.json)
// =============================================================================

import { Settings } from "@agentxm/core/schemas";

export const SettingsValidity: Schema.Schema<SettingsValidity> = Schema.Union(
  Schema.TaggedStruct("Valid", {}),
  Schema.TaggedStruct("ParseError", { error: Schema.String }),
  Schema.TaggedStruct("SchemaMismatch", {
    errors: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct("OrphanedSkills", { names: Schema.Array(Schema.String) }),
  Schema.TaggedStruct("OrphanedCommands", {
    names: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct("Multiple", {
    issues: Schema.Array(Schema.suspend(() => SettingsValidity)),
  }),
);
export type SettingsValidity = typeof SettingsValidity.Type;

/**
 * Settings state reuses the Settings schema directly.
 * Actual = parsed Settings from disk. Ideal = desired Settings.
 */
export const SettingsState = Schema.Struct({
  path: Schema.String,
  actual: Schema.OptionFromNullOr(Settings),
  lastModified: Schema.OptionFromNullOr(Schema.Date),
  validity: SettingsValidity,
});
export type SettingsState = typeof SettingsState.Type;

// IdealSettings is just Settings - what we want settings.json to become
type IdealSettings = Settings;

// =============================================================================
// Workspace State (top-level container)
// =============================================================================

export const WorkspaceLevel = Schema.Literal("project", "user");
export type WorkspaceLevel = typeof WorkspaceLevel.Type;

/**
 * Complete state of an axm workspace.
 * Aggregates all extension states and settings.
 *
 * Works for both levels:
 * - Project level: axmDir = ".axm/", extensions in project
 * - User level (--global): axmDir = "~/.axm/", extensions at user level
 *
 * The same state model applies; only paths differ.
 */
export const WorkspaceState = Schema.Struct({
  level: WorkspaceLevel,
  axmDir: Schema.String,
  skills: SkillsState,
  commands: CommandsState,
  mcpServers: McpServersState,
  packs: PacksState,
  settings: SettingsState,
  loadedAt: Schema.Date,
});
export type WorkspaceState = typeof WorkspaceState.Type;

// =============================================================================
// Other Extension Types (follow same pattern as Skills)
// =============================================================================

// Commands: Shell commands with aliases
// Actual: { name, path, content, aliases, lastModified }
// Locked: { source, origin, aliases, folderHash, installedAt, updatedAt }
// Validity: Valid | MissingCommandFile | InvalidManifest | Orphaned | Missing | HashMismatch

// MCP Servers: Model Context Protocol server configurations
// Actual: { name, path, config, lastModified }
// Locked: { source, origin, config, installedAt, updatedAt }
// Validity: Valid | InvalidConfig | Orphaned | Missing | ConfigMismatch

// Packs: Bundles of skills/commands/mcps
// Actual: { name, path, manifest, members, lastModified }
// Locked: { source, origin, version, members, installedAt, updatedAt }
// Validity: Valid | InvalidManifest | MissingMembers | Orphaned | Missing

// =============================================================================
// Ideal State (desired after operation)
// =============================================================================

export const SkillSource = Schema.Union(
  Schema.TaggedStruct("Local", { path: Schema.String }),
  Schema.TaggedStruct("Git", {
    url: Schema.String,
    ref: Schema.OptionFromNullOr(Schema.String),
    subpath: Schema.OptionFromNullOr(Schema.String),
  }),
  Schema.TaggedStruct("WellKnown", {
    baseUrl: Schema.String,
    skillName: Schema.String,
  }),
  Schema.TaggedStruct("Registry", {
    name: Schema.String,
    version: Schema.String,
  }),
);
export type SkillSource = typeof SkillSource.Type;

export const IdealSkill = Schema.Struct({
  name: Schema.String,
  source: SkillSource,
  folderHash: Schema.String,
  description: Schema.OptionFromNullOr(Schema.String),
  agents: Schema.Array(Schema.String),
});
export type IdealSkill = typeof IdealSkill.Type;

export const IdealSkillsState = Schema.Struct({
  skills: Schema.Record({ key: Schema.String, value: IdealSkill }),
  removals: Schema.Array(Schema.String), // Immutable array of names to remove
});
export type IdealSkillsState = typeof IdealSkillsState.Type;

/**
 * Complete ideal state for a project workspace.
 * IdealSettings = Settings (reuses schema directly).
 */
export const IdealWorkspaceState = Schema.Struct({
  skills: IdealSkillsState,
  commands: IdealCommandsState, // defined similarly
  mcpServers: IdealMcpServersState,
  packs: IdealPacksState,
  settings: Settings,
});
export type IdealWorkspaceState = typeof IdealWorkspaceState.Type;

// =============================================================================
// Diff / Plan
// =============================================================================

export const SkillChange = Schema.Union(
  Schema.TaggedStruct("Add", { skill: IdealSkill }),
  Schema.TaggedStruct("Update", { from: SkillState, to: IdealSkill }),
  Schema.TaggedStruct("Remove", { skill: SkillState }),
  Schema.TaggedStruct("Unchanged", { skill: SkillState }),
  Schema.TaggedStruct("Repair", { skill: SkillState, target: IdealSkill }),
);
export type SkillChange = typeof SkillChange.Type;

export const DiffSummary = Schema.Struct({
  add: Schema.Number,
  update: Schema.Number,
  remove: Schema.Number,
  unchanged: Schema.Number,
  repair: Schema.Number,
});
export type DiffSummary = typeof DiffSummary.Type;

export const SkillsDiff = Schema.Struct({
  changes: Schema.Record({ key: Schema.String, value: SkillChange }),
  summary: DiffSummary,
});
export type SkillsDiff = typeof SkillsDiff.Type;

// =============================================================================
// Settings Diff (key-path based)
// =============================================================================

/**
 * Settings changes tracked per field/key.
 * Simpler than SkillsDiff since Settings is a flat map structure.
 */
export const SettingsKeyChange = Schema.Union(
  Schema.TaggedStruct("Added", { key: Schema.String, value: Schema.String }),
  Schema.TaggedStruct("Removed", {
    key: Schema.String,
    previousValue: Schema.String,
  }),
  Schema.TaggedStruct("Changed", {
    key: Schema.String,
    from: Schema.String,
    to: Schema.String,
  }),
);
export type SettingsKeyChange = typeof SettingsKeyChange.Type;

export const AgentsDiff = Schema.Struct({
  added: Schema.Array(Schema.String),
  removed: Schema.Array(Schema.String),
});

export const ScopeDiff = Schema.Struct({
  from: Schema.OptionFromNullOr(Schema.String),
  to: Schema.String,
});

export const SettingsDiff = Schema.Struct({
  skills: Schema.Array(SettingsKeyChange),
  commands: Schema.Array(SettingsKeyChange),
  packs: Schema.Array(SettingsKeyChange),
  mcpServers: Schema.Array(SettingsKeyChange),
  agents: AgentsDiff,
  scope: Schema.OptionFromNullOr(ScopeDiff),
});
export type SettingsDiff = typeof SettingsDiff.Type;

// =============================================================================
// Workspace Diff (combined)
// =============================================================================

export const WorkspaceDiff = Schema.Struct({
  skills: SkillsDiff,
  commands: CommandsDiff, // defined similarly
  mcpServers: McpServersDiff,
  packs: PacksDiff,
  settings: SettingsDiff,
});
export type WorkspaceDiff = typeof WorkspaceDiff.Type;

// =============================================================================
// Agent Sync (computed separately, hidden from plan output)
// =============================================================================

export const SyncMethod = Schema.Literal("symlink", "copy");

export const AgentSyncStatus = Schema.Union(
  Schema.TaggedStruct("Synced", { method: SyncMethod }),
  Schema.TaggedStruct("Missing", {}),
  Schema.TaggedStruct("Stale", {
    expected: Schema.String,
    actual: Schema.String,
  }),
  Schema.TaggedStruct("BrokenSymlink", {
    link: Schema.String,
    target: Schema.String,
  }),
);
export type AgentSyncStatus = typeof AgentSyncStatus.Type;

export const SkillSyncState = Schema.Struct({
  skillName: Schema.String,
  canonicalPath: Schema.String,
  agents: Schema.Record({ key: Schema.String, value: AgentSyncStatus }), // agentId -> status
});
export type SkillSyncState = typeof SkillSyncState.Type;
```

---

## State Loading

```typescript
// packages/core/src/skills/state/load.ts

import { Array, Effect, Option, pipe, Record } from "effect";
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

    // Merge keys from both maps and build state
    const allNames = pipe(
      [...actualMap.keys(), ...lockedMap.keys()],
      Array.dedupe,
    );

    const skills = pipe(
      allNames,
      Array.map((name) => {
        const actual = Option.fromNullable(actualMap.get(name));
        const locked = Option.fromNullable(lockedMap.get(name));
        const validity = computeValidity(actual, locked);
        return [name, { name, actual, locked, validity }] as const;
      }),
      Record.fromEntries,
    );

    return { skills, axmDir, loadedAt: new Date() };
  });

/**
 * Compute validity by comparing actual vs locked state.
 */
const computeValidity = (
  actual: Option.Option<ActualSkill>,
  locked: Option.Option<LockedSkill>,
): SkillValidity =>
  pipe(
    // Handle presence/absence cases
    Option.match(actual, {
      onNone: () =>
        Option.match(locked, {
          onNone: () => Option.some(SkillValidity.Valid({})),
          onSome: (l) =>
            Option.some(SkillValidity.Missing({ code: "E004", expected: l })),
        }),
      onSome: (a) =>
        Option.match(locked, {
          onNone: () => Option.some(SkillValidity.Orphaned({ code: "W002" })),
          onSome: (l) => Option.none(), // Both exist - need detailed comparison
        }),
    }),
    Option.getOrElse(() => {
      // Both exist - compare and collect issues
      const a = Option.getOrThrow(actual);
      const l = Option.getOrThrow(locked);

      const issues = pipe(
        [
          // Missing SKILL.md
          a.content === ""
            ? Option.some(
                SkillValidity.MissingSkillMd({
                  code: "E001",
                  path: `${a.path}/SKILL.md`,
                }),
              )
            : Option.none(),

          // Invalid frontmatter
          Option.isNone(a.frontmatter) && a.content !== ""
            ? Option.some(
                SkillValidity.InvalidFrontmatter({
                  code: "E002",
                  errors: ["Failed to parse"],
                }),
              )
            : Option.none(),

          // Name mismatch (only if frontmatter exists)
          pipe(
            a.frontmatter,
            Option.flatMap((fm) =>
              fm.name && fm.name !== a.name
                ? Option.some(
                    SkillValidity.NameMismatch({
                      code: "E003",
                      frontmatterName: fm.name,
                      directoryName: a.name,
                    }),
                  )
                : Option.none(),
            ),
          ),

          // Missing description (only if frontmatter exists)
          pipe(
            a.frontmatter,
            Option.flatMap((fm) =>
              !fm.description
                ? Option.some(
                    SkillValidity.MissingDescription({ code: "W001" }),
                  )
                : Option.none(),
            ),
          ),

          // Hash mismatch
          a.folderHash !== l.folderHash
            ? Option.some(
                SkillValidity.HashMismatch({
                  code: "E005",
                  expected: l.folderHash,
                  actual: a.folderHash,
                }),
              )
            : Option.none(),
        ],
        Array.getSomes,
      );

      return pipe(
        issues,
        Array.match({
          onEmpty: () => SkillValidity.Valid({}),
          onNonEmpty: (nonEmpty) =>
            nonEmpty.length === 1
              ? nonEmpty[0]
              : SkillValidity.Multiple({ issues: nonEmpty }),
        }),
      );
    }),
  );

/**
 * Load complete workspace state: all extension types + settings.
 */
export const loadWorkspaceState = (
  axmDir: string,
  level: WorkspaceLevel,
): Effect.Effect<WorkspaceState, LoadError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // Load all extension states in parallel
    const [skills, commands, mcpServers, packs, settings] = yield* Effect.all([
      loadSkillsState(axmDir),
      loadCommandsState(axmDir),
      loadMcpServersState(axmDir),
      loadPacksState(axmDir),
      loadSettingsState(axmDir),
    ]);

    return {
      level,
      axmDir,
      skills,
      commands,
      mcpServers,
      packs,
      settings,
      loadedAt: new Date(),
    };
  });
```

---

## Ideal State Builders

Each operation builds the ideal state differently:

```typescript
// packages/core/src/skills/state/ideal.ts

import { Array, Effect, Option, pipe, Record } from "effect";

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
        ? pipe(
            discovered,
            Array.filter((s) => options.skills.includes(s.name)),
          )
        : discovered;

    // Keep existing valid skills as ideal
    const existingIdeal = pipe(
      Object.entries(current.skills),
      Array.filter(
        ([_, state]) =>
          Option.isSome(state.actual) && Option.isSome(state.locked),
      ),
      Array.map(([name, state]) => [name, stateToIdeal(state)] as const),
      Record.fromEntries,
    );

    // Add/update from source (skip existing unless force)
    const newIdeal = pipe(
      filtered,
      Array.filter((skill) => {
        const existing = current.skills[skill.name];
        return !existing || Option.isNone(existing.actual) || options.force;
      }),
      Array.map((skill) => [skill.name, skill] as const),
      Record.fromEntries,
    );

    return {
      skills: { ...existingIdeal, ...newIdeal },
      removals: [],
    };
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
    // Filter to skills with lock entries
    const lockedSkills = pipe(
      Object.entries(current.skills),
      Array.filter(([_, state]) => Option.isSome(state.locked)),
    );

    // Partition into skills to update vs keep
    const [toUpdate, toKeep] = pipe(
      lockedSkills,
      Array.partition(([name]) => !skillNames || skillNames.includes(name)),
    );

    // Fetch latest versions for skills to update
    const updatedSkills = yield* pipe(
      toUpdate,
      Effect.forEach(
        ([name, state]) =>
          pipe(
            fetchLatestVersion(Option.getOrThrow(state.locked)),
            Effect.map((latest) => [name, latest] as const),
          ),
        { concurrency: "inherit" },
      ),
    );

    // Keep existing versions for others
    const keptSkills = pipe(
      toKeep,
      Array.map(([name, state]) => [name, stateToIdeal(state)] as const),
    );

    return {
      skills: pipe([...updatedSkills, ...keptSkills], Record.fromEntries),
      removals: [],
    };
  });

/**
 * Build ideal state for uninstall operation.
 */
export const buildIdealForUninstall = (
  current: SkillsState,
  skillNames: readonly string[],
): Effect.Effect<IdealSkillsState, BuildIdealError, never> =>
  Effect.succeed({
    // Keep skills not being uninstalled
    skills: pipe(
      Object.entries(current.skills),
      Array.filter(
        ([name, state]) =>
          !skillNames.includes(name) && Option.isSome(state.locked),
      ),
      Array.map(([name, state]) => [name, stateToIdeal(state)] as const),
      Record.fromEntries,
    ),
    // Mark specified skills for removal
    removals: pipe(
      skillNames,
      Array.filter((name) => name in current.skills),
    ),
  });

/**
 * Build ideal state for sync operation (repair drift).
 */
export const buildIdealForSync = (
  current: SkillsState,
): Effect.Effect<IdealSkillsState, BuildIdealError, never> => {
  const entries = Object.entries(current.skills);

  return Effect.succeed({
    // Keep locked skills as ideal
    skills: pipe(
      entries,
      Array.filter(([_, state]) => Option.isSome(state.locked)),
      Array.map(([name, state]) => [name, stateToIdeal(state)] as const),
      Record.fromEntries,
    ),
    // Mark orphaned (actual but not locked) for removal
    removals: pipe(
      entries,
      Array.filter(
        ([_, state]) =>
          Option.isNone(state.locked) && Option.isSome(state.actual),
      ),
      Array.map(([name]) => name),
    ),
  });
};
```

---

## Diff Computation

```typescript
// packages/core/src/skills/state/diff.ts

import { Array, Option, pipe, Record } from "effect";

/**
 * Compute diff between current and ideal state.
 * This is the "plan" displayed in dry-run and executed in apply.
 */
export const computeDiff = (
  current: SkillsState,
  ideal: IdealSkillsState,
): SkillsDiff => {
  // Process removals
  const removalChanges = pipe(
    ideal.removals,
    Array.filterMap((name) =>
      pipe(
        Option.fromNullable(current.skills[name]),
        Option.filter((state) => Option.isSome(state.actual)),
        Option.map(
          (state) => [name, SkillChange.Remove({ skill: state })] as const,
        ),
      ),
    ),
  );

  // Process ideal skills
  const idealChanges = pipe(
    Object.entries(ideal.skills),
    Array.map(([name, idealSkill]) => {
      const currentState = current.skills[name];

      // Not installed -> Add
      if (!currentState || Option.isNone(currentState.actual)) {
        return [name, SkillChange.Add({ skill: idealSkill })] as const;
      }

      // Invalid state -> Repair
      const needsRepair =
        !SkillValidity.$is("Valid")(currentState.validity) &&
        !SkillValidity.$is("MissingDescription")(currentState.validity) &&
        !SkillValidity.$is("HashMismatch")(currentState.validity);

      if (needsRepair) {
        return [
          name,
          SkillChange.Repair({ skill: currentState, target: idealSkill }),
        ] as const;
      }

      // Hash differs -> Update
      if (
        Option.getOrThrow(currentState.actual).folderHash !==
        idealSkill.folderHash
      ) {
        return [
          name,
          SkillChange.Update({ from: currentState, to: idealSkill }),
        ] as const;
      }

      // Unchanged
      return [name, SkillChange.Unchanged({ skill: currentState })] as const;
    }),
  );

  const changes = pipe(
    [...removalChanges, ...idealChanges],
    Record.fromEntries,
  );

  // Compute summary from changes
  const summary = pipe(
    Object.values(changes),
    Array.reduce(
      { add: 0, update: 0, remove: 0, unchanged: 0, repair: 0 },
      (acc, change) =>
        SkillChange.$match(change, {
          Add: () => ({ ...acc, add: acc.add + 1 }),
          Update: () => ({ ...acc, update: acc.update + 1 }),
          Remove: () => ({ ...acc, remove: acc.remove + 1 }),
          Unchanged: () => ({ ...acc, unchanged: acc.unchanged + 1 }),
          Repair: () => ({ ...acc, repair: acc.repair + 1 }),
        }),
    ),
  );

  return { changes, summary };
};

export const hasChanges = (diff: SkillsDiff): boolean =>
  diff.summary.add > 0 ||
  diff.summary.update > 0 ||
  diff.summary.remove > 0 ||
  diff.summary.repair > 0;
```

---

## Display Format

Dry-run output shows the plan in a human-readable format:

```
Plan:

  Skills:
    + @skills/commit                      (add)
    ~ @skills/review-pr  abc123 → def456  (update)
    ! @skills/broken                      (repair)
    - @skills/deprecated                  (remove)

  Settings:
    skills:
      + @skills/commit = "^1.0.0"
      - @skills/deprecated

  Summary: 1 to add, 1 to update, 1 to repair, 1 to remove
```

### Display Rules

1. **Unchanged items are hidden** — only show what will change
2. **Agent sync is hidden** — implementation detail, not user-facing
3. **Symbols**: `+` add, `~` update, `!` repair, `-` remove
4. **Hash preview**: Show short hashes for updates (first 7 chars)
5. **Settings grouped by section**: skills, commands, packs, mcp-servers

### JSON Output (`--json`)

Internal state uses `Record<string, SkillChange>` for O(1) lookups and immutable updates. JSON output transforms to arrays for CLI consumers (easier to iterate, no key duplication).

```json
{
  "skills": {
    "changes": [
      {
        "_tag": "Add",
        "name": "@skills/commit",
        "source": { "_tag": "Git", "url": "github:org/repo" }
      },
      {
        "_tag": "Update",
        "name": "@skills/review-pr",
        "fromHash": "abc123",
        "toHash": "def456"
      },
      { "_tag": "Remove", "name": "@skills/deprecated" }
    ],
    "summary": { "add": 1, "update": 1, "remove": 1, "repair": 0 }
  },
  "settings": {
    "skills": [
      { "_tag": "Added", "key": "@skills/commit", "value": "^1.0.0" },
      {
        "_tag": "Removed",
        "key": "@skills/deprecated",
        "previousValue": "^2.0.0"
      }
    ]
  }
}
```

Effect Schema transformation for JSON encoding:

```typescript
// Internal: Record for O(1) lookups and immutable updates
const SkillsDiffInternal = Schema.Struct({
  changes: Schema.Record({ key: Schema.String, value: SkillChange }),
  summary: DiffSummary,
});

// JSON: Array for CLI consumers
const SkillsDiffJson = Schema.Struct({
  changes: Schema.Array(
    SkillChange.pipe(Schema.extend(Schema.Struct({ name: Schema.String }))),
  ),
  summary: DiffSummary,
});

// Transform between representations
export const SkillsDiff = SkillsDiffInternal.pipe(
  Schema.transform(SkillsDiffJson, {
    decode: (internal) => ({
      ...internal,
      changes: pipe(
        Object.entries(internal.changes),
        Array.map(([name, change]) => ({ ...change, name })),
      ),
    }),
    encode: (json) => ({
      ...json,
      changes: pipe(
        json.changes,
        Array.map((c) => [c.name, c] as const),
        Record.fromEntries,
      ),
    }),
  }),
);
```

---

## Apply Phase

```typescript
// packages/core/src/skills/state/apply.ts

import { Array, Effect, Option, pipe, Record, Schema } from "effect";

// =============================================================================
// Progress Events
// =============================================================================

export const ApplyProgressEvent = Schema.Union(
  Schema.TaggedStruct("StartingSkill", {
    name: Schema.String,
    action: Schema.Literal("add", "update", "remove", "repair"),
  }),
  Schema.TaggedStruct("CompletedSkill", {
    name: Schema.String,
    action: Schema.Literal("add", "update", "remove", "repair"),
  }),
  Schema.TaggedStruct("FailedSkill", {
    name: Schema.String,
    error: Schema.String,
  }),
  Schema.TaggedStruct("SyncingAgent", {
    skillName: Schema.String,
    agentId: Schema.String,
  }),
  Schema.TaggedStruct("UpdatingSettings", {}),
  Schema.TaggedStruct("UpdatingLockfile", {}),
);
export type ApplyProgressEvent = typeof ApplyProgressEvent.Type;

// =============================================================================
// Apply Result
// =============================================================================

export interface ApplyResult {
  readonly applied: Record<string, AppliedChange>;
  readonly failed: Record<string, ApplyError>;
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
 *
 * Apply order (sequential to maintain consistency):
 * 1. Apply skill file changes (copy/remove from canonical location)
 * 2. Sync to agents (symlinks/copies to agent directories)
 * 3. Update settings.json
 * 4. Update lockfile (last, as source of truth)
 *
 * If any step fails, we stop and return partial results.
 * User can inspect state and retry or git reset.
 */
export const applyDiff = (
  diff: WorkspaceDiff,
  options: ApplyOptions,
): Effect.Effect<ApplyResult, ApplyError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    // Phase 1: Apply skill file changes (sequential for consistency)
    const changesToApply = pipe(
      Object.entries(diff.skills.changes),
      Array.filter(([_, change]) => !SkillChange.$is("Unchanged")(change)),
    );

    const applied = yield* pipe(
      changesToApply,
      Effect.reduce(
        Record.empty<string, AppliedChange>(),
        (acc, [name, change]) =>
          Effect.gen(function* () {
            options.onProgress?.(
              ApplyProgressEvent.StartingSkill({
                name,
                action: changeToAction(change),
              }),
            );

            const result = yield* applyChange(change, options);

            options.onProgress?.(
              ApplyProgressEvent.CompletedSkill({
                name,
                action: result.type,
              }),
            );

            return { ...acc, [name]: result };
          }),
      ),
    );

    // Phase 2: Sync to agents (after all files are in place)
    const skillsToSync = pipe(
      Object.entries(diff.skills.changes),
      Array.filter(
        ([_, change]) =>
          !SkillChange.$is("Unchanged")(change) &&
          !SkillChange.$is("Remove")(change),
      ),
    );

    yield* pipe(
      skillsToSync,
      Effect.forEach(([name]) =>
        pipe(
          options.agents,
          Effect.forEach((agent) =>
            Effect.gen(function* () {
              options.onProgress?.(
                ApplyProgressEvent.SyncingAgent({
                  skillName: name,
                  agentId: agent.id,
                }),
              );
              yield* syncSkillToAgent(name, options.axmDir, agent);
            }),
          ),
        ),
      ),
    );

    // Phase 3: Update settings.json
    yield* pipe(
      Effect.when(
        Effect.gen(function* () {
          options.onProgress?.(ApplyProgressEvent.UpdatingSettings({}));
          yield* applySettingsDiff(diff.settings, options.axmDir);
        }),
        () => hasSettingsChanges(diff.settings),
      ),
    );

    // Phase 4: Update lockfile (last, as source of truth)
    yield* pipe(
      Effect.when(
        Effect.gen(function* () {
          options.onProgress?.(ApplyProgressEvent.UpdatingLockfile({}));
          yield* updateLockfile(options.axmDir, diff, applied);
        }),
        () => Object.keys(applied).length > 0,
      ),
    );

    // Compute summary from applied changes
    const summary = pipe(
      Object.values(applied),
      Array.reduce(
        { added: 0, updated: 0, removed: 0, repaired: 0, failed: 0 },
        (acc, change) => ({
          ...acc,
          [change.type === "add" ? "added" : `${change.type}d`]:
            acc[
              change.type === "add"
                ? "added"
                : (`${change.type}d` as keyof typeof acc)
            ] + 1,
        }),
      ),
    );

    return { applied, failed: Record.empty(), summary };
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
  pipe(
    Effect.Do,
    Effect.let("canonicalPath", () => `${options.axmDir}/skills/${skill.name}`),
    Effect.bind("tempPath", () => fetchSource(skill.source, skill.name)),
    Effect.tap(({ tempPath, canonicalPath }) =>
      copyToCanonical(tempPath, canonicalPath, skill.name),
    ),
    Effect.bind("syncedAgents", ({ canonicalPath }) =>
      syncToAgents(canonicalPath, skill.name, options.agents),
    ),
    Effect.tap(({ tempPath }) => cleanupTemp(tempPath)),
    Effect.map(({ syncedAgents }) => ({
      name: skill.name,
      type: "add" as const,
      agentsSynced: syncedAgents,
    })),
  );

// Update, Remove, Repair follow similar patterns...
```

---

## Handler Integration

```typescript
// packages/cli/src/commands/skills/install/handler.ts

import { Array, Effect, pipe } from "effect";

export const handleInstall = (args: InstallArgs) =>
  Effect.gen(function* () {
    const axmDir = getAxmDir(args.global);
    const agents = yield* resolveAgents(args);

    p.intro("axm skills install");

    // Phase 1: Load current state
    const spinner = p.spinner();
    spinner.start("Analyzing project...");
    const current = yield* loadSkillsState(axmDir);
    spinner.stop(
      `Found ${Object.keys(current.skills).length} installed skill(s)`,
    );

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
    pipe(
      Object.entries(result.failed),
      Array.forEach(([name, error]) =>
        p.log.error(`Failed: ${name} - ${error.message}`),
      ),
    );

    p.outro(`Installed ${result.summary.added} skill(s)`);
  });
```

---

## Unified Validation

The state model naturally supports `doctor` and `validate`:

```typescript
// packages/cli/src/commands/doctor/handler.ts

import { Array, Effect, Option, pipe } from "effect";

export const handleDoctor = () =>
  Effect.gen(function* () {
    const axmDir = yield* findAxmDir();
    const current = yield* loadSkillsState(axmDir);

    // Collect skill validity issues
    const skillIssues = pipe(
      Object.entries(current.skills),
      Array.filterMap(([name, state]) =>
        SkillValidity.$is("Valid")(state.validity)
          ? Option.none()
          : Option.some({
              name,
              code: getValidityCode(state.validity),
              severity: severityFromCode(getValidityCode(state.validity)!),
              message: describeValidity(state.validity),
            }),
      ),
    );

    // Log skill issues
    pipe(
      skillIssues,
      Array.forEach(({ name, code, severity, message }) => {
        const formatted = `${name}: [${code}] ${message}`;
        severity === "error" ? p.log.error(formatted) : p.log.warn(formatted);
      }),
    );

    // Check agent sync status
    const syncStates = yield* loadAgentSyncStates(axmDir);
    const brokenSymlinks = pipe(
      syncStates,
      Array.flatMap((sync) =>
        pipe(
          Object.entries(sync.agents),
          Array.filterMap(([agentId, status]) =>
            AgentSyncStatus.$is("BrokenSymlink")(status)
              ? Option.some({ skillName: sync.skillName, agentId })
              : Option.none(),
          ),
        ),
      ),
    );

    // Log broken symlinks
    pipe(
      brokenSymlinks,
      Array.forEach(({ skillName, agentId }) =>
        p.log.error(`${skillName}: Broken symlink to ${agentId}`),
      ),
    );

    // Compute totals
    const errors =
      pipe(
        skillIssues,
        Array.filter((i) => i.severity === "error"),
        Array.length,
      ) + brokenSymlinks.length;

    const warnings = pipe(
      skillIssues,
      Array.filter((i) => i.severity === "warning"),
      Array.length,
    );

    // Report
    errors === 0 && warnings === 0
      ? p.log.success("No issues found")
      : p.log.info(`${errors} error(s), ${warnings} warning(s)`);
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
      plan.skills.changes
        .filter((c) => c._tag === "Add")
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

| Decision            | Choice                                     | Rationale                                                                  |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| Architecture        | State diffing (Arborist-style)             | Unified validation, natural idempotency, reusable for doctor/sync          |
| State separation    | actual + locked → merged with validity     | Clear provenance, supports all comparison scenarios                        |
| Per-type state      | SkillState, CommandState, etc.             | Type-specific validation, manifests, behaviors                             |
| Type definitions    | Effect Schema (not interfaces)             | Enables JSON serialization, test deserialization, runtime validation       |
| Locked types        | Derived from LockEntry via Schema          | One source of truth; Schema handles string↔Date, optional↔Option           |
| Top-level container | WorkspaceState                             | Aggregates all extension states + settings for unified operations          |
| Workspace level     | Same model for project and user            | Only paths differ; `level` field distinguishes                             |
| Settings state      | Reuses Settings schema for actual/ideal    | One source of truth; operations may modify skills, commands, etc.          |
| Settings diff       | Key-path based (not tagged union)          | Simpler than SkillsDiff; Settings is flat map structure                    |
| Agent sync display  | Hidden from plan output                    | Implementation detail; plan focuses on extension changes                   |
| Agent sync          | Separate from extension state              | Avoids N×M complexity, computed on demand                                  |
| Validity            | Schema.TaggedStruct union                  | Actionable errors, supports multiple issues, serializable                  |
| Diff as plan        | SkillChange tagged union                   | Same display for dry-run and execution                                     |
| Apply phase         | Idempotent operations                      | Re-run fixes partial failures                                              |
| Discovery effects   | Allow git clone with messaging             | Remote source contents needed for ideal state; messaging sets expectations |
| JSON output         | Record internally, array for JSON          | O(1) lookups internally; arrays easier for CLI consumers to iterate        |
| Data structures     | Immutable Record/Array (not Map/Set)       | FP-friendly; works with pipe/Array combinators; natural JSON serialization |
| Parallel apply      | Sequential phases, parallel within phase   | Maintains consistency; lockfile updated last as source of truth            |
| Partial failure     | Stop on first error, return partial result | User can inspect state and retry; lockfile only updated on full success    |
| Agent sync timing   | After all files in place, before lockfile  | Ensures files exist before syncing; sync failure stops before lockfile     |
| Validity codes      | Static codes per variant (E001, W001)      | Stable IDs for docs, automation, suppression; severity from prefix         |

---

## Open Questions

### Resolved

1. **State model**: Arborist-style with actual/locked/ideal ✓
2. **Per-type state**: Yes, each extension type has own types ✓
3. **Agent sync**: Separate concern, computed on demand ✓
4. **Validity**: Schema.TaggedStruct union for serialization ✓
5. **Locked types**: Derived from LockEntry schema via Effect Schema transformations ✓
6. **Type definitions**: All types as Effect Schemas (not interfaces) for JSON serialization ✓
7. **Top-level container**: WorkspaceState aggregates all extension states + settings ✓
8. **Workspace level**: Same model for project and user; only paths differ ✓
9. **Settings state**: Reuses existing Settings schema for actual/ideal; no separate types ✓
10. **Settings diff**: Key-path based approach (simpler than tagged union for flat maps) ✓
11. **Agent sync display**: Hidden from plan output; implementation detail ✓
12. **Discovery side effects**: Dry-run allows git clone to determine remote source contents, with clear messaging ✓
13. **JSON output**: Record internally, transform to array for JSON output ✓
14. **Apply phases**: Sequential (files → agent sync → settings → lockfile) for consistency ✓
15. **Partial failure**: Stop on first error; lockfile only updated on full success ✓
16. **Agent sync timing**: After files in place, before lockfile; failure stops apply ✓
17. **Validity codes**: Static codes per variant (E001, W001, etc.) for docs/automation ✓
18. **Staleness detection**: Non-goal ✓

### Future Work

19. **Type-specific lock entries**: The current `LockEntry` schema is generic across all extension types. May need type-specific schemas (e.g., `SkillLockEntry`, `CommandLockEntry`) if extension types diverge in their lockfile fields (triggers for skills, aliases for commands, etc.).
