# Dry-Run Capability: State-Based Architecture

## Executive Summary

This document describes a state-based architecture for dry-run functionality, inspired by npm's Arborist library. Rather than generating an operation log, we model three states:

- **Actual** — What's on disk
- **Locked** — What the lockfile says
- **Ideal** — Desired state after the operation

The diff between current (actual + locked) and ideal produces the plan. Dry-run displays the plan without applying it.

---

## Current Install Flow (8 Steps)

1. **Parse Source** — Resolve `github:owner/repo`, local path, or well-known URL (see `source-parser.ts` and `resolution/`)
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

### Design Principle: Plain Interfaces + Schema at Boundaries

We use a separation of concerns approach:

1. **Plain interfaces** — Domain types with `_tag` discriminator for pattern matching
2. **Exhaustive switch statements** — TypeScript catches missing cases at compile time
3. **`Schema.TaggedUnion`** — JSON serialization for `--json` output (at boundaries only)

This enables:

- **Simple domain modeling** — Plain TypeScript interfaces, no runtime overhead
- **Exhaustive matching** — Switch statements with TypeScript control flow analysis
- **Inline type checks** — Simple `value._tag === "Add"` checks
- **JSON serialization** — `--json` flag outputs valid JSON that can be parsed back
- **Test deserialization** — E2E tests can parse CLI output and assert on structured data
- **Runtime validation** — `Schema.decodeUnknown` validates data at boundaries

```typescript
import { Schema } from "effect";

// Pattern: Plain interfaces for domain, Schema for serialization
export type MyChange =
  | { readonly _tag: "Add"; readonly item: Item }
  | { readonly _tag: "Remove"; readonly name: string };

// Constructors: Simple object literals
const addChange: MyChange = { _tag: "Add", item };
const removeChange: MyChange = { _tag: "Remove", name: "foo" };

// Pattern matching with exhaustive switch (TypeScript catches missing cases)
const handleChange = (change: MyChange): string => {
  switch (change._tag) {
    case "Add":
      return `Adding ${change.item.name}`;
    case "Remove":
      return `Removing ${change.name}`;
  }
};

// Type guards: inline checks
const isAdd = (change: MyChange): change is MyChange & { _tag: "Add" } =>
  change._tag === "Add";

// Or just use inline: change._tag === "Add"

// Schema for JSON serialization (using Union of TaggedStructs)
const MyChangeSchema = Schema.Union(
  Schema.TaggedStruct("Add", { item: ItemSchema }),
  Schema.TaggedStruct("Remove", { name: Schema.String }),
);
```

For simple non-union data types that only need serialization, you can derive the type from Schema:

```typescript
// Only for serialization-boundary types, not domain types
const MyTypeSchema = Schema.Struct({
  name: Schema.String,
  value: Schema.Number,
});
type MyType = typeof MyTypeSchema.Type;
```

### Per-Extension-Type Design

Each extension type (skill, command, pack, mcp) has its own state types with type-specific validation.

**Pattern:** Define plain interfaces for domain, separate schemas for serialization:

```typescript
// Shared pattern for state types
interface StateBase<TActual, TLocked, TValidity> {
  readonly name: string;
  readonly actual: Option.Option<TActual>;
  readonly locked: Option.Option<TLocked>;
  readonly validity: TValidity;
}

// Domain interfaces
interface LockedSkill {
  readonly source: string;
  readonly origin: string;
  readonly gitTreeFolderHash: string;
  // ...
}

// Schema for JSON serialization (derived from LockEntry with transformations)
const LockedSkillSchema = LockEntry.pipe(Schema.transform(...));

// Per-type implementations use the shared pattern
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

import { Array, Data, Option, pipe, Schema } from "effect";
import { FullyQualifiedName, Settings } from "@agentxm/core/schemas";

// =============================================================================
// Actual State (what's on disk)
// =============================================================================

/** Skill frontmatter parsed from SKILL.md */
export interface SkillFrontmatter {
  readonly name?: string;
  readonly description?: string;
  readonly version?: string;
  readonly triggers?: readonly string[];
}

// Schema for JSON serialization
export const SkillFrontmatterSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  triggers: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Skill as it exists on disk at canonical location (.axm/skills/<name>/).
 *
 * The gitTreeFolderHash is the git tree hash of the skill folder, computed using
 * git's tree object algorithm for deterministic, cross-platform hashing.
 */
export interface ActualSkill {
  readonly name: string;
  readonly path: string;
  readonly frontmatter: Option.Option<SkillFrontmatter>;
  readonly content: string;
  readonly gitTreeFolderHash: string;
  readonly files: readonly string[];
  readonly lastModified: Date;
}

// Schema for JSON serialization
export const ActualSkillSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  frontmatter: Schema.OptionFromNullOr(SkillFrontmatterSchema),
  content: Schema.String,
  gitTreeFolderHash: Schema.String,
  files: Schema.Array(Schema.String),
  lastModified: Schema.Date,
});

// =============================================================================
// Locked State (what the lockfile says)
// =============================================================================

/**
 * Skill entry from axm-lock.yaml.
 *
 * Derived from the LockEntry schema with Effect Schema transformations.
 * The schema handles string ↔ Date and optional ↔ Option conversions.
 */
export interface LockedSkill {
  readonly source: string;
  readonly origin: string;
  readonly path: Option.Option<string>;
  readonly ref: Option.Option<string>;
  readonly version: Option.Option<string>;
  readonly gitTreeFolderHash: string;
  readonly installedAt: Date;
  readonly updatedAt: Date;
}

// Schema for JSON serialization
export const LockedSkillSchema = Schema.Struct({
  source: Schema.String,
  origin: Schema.String,
  path: Schema.OptionFromNullOr(Schema.String),
  ref: Schema.OptionFromNullOr(Schema.String),
  version: Schema.OptionFromNullOr(Schema.String),
  gitTreeFolderHash: Schema.String,
  installedAt: Schema.Date,
  updatedAt: Schema.Date,
});

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
export type SkillValidityCode =
  | "E001"
  | "E002"
  | "E003"
  | "E004"
  | "E005"
  | "E006"
  | "W001"
  | "W002";

/**
 * Skill validity states as discriminated union.
 * Each variant has a static code for identification.
 * Severity derived from code prefix: E = error, W = warning.
 *
 * Use exhaustive switch statements for pattern matching:
 * - TypeScript catches missing cases at compile time
 * - No runtime overhead from tagged enum machinery
 * - Simple inline checks: validity._tag === "Valid"
 */
export type SkillValidity =
  | { readonly _tag: "Valid" }
  | {
      readonly _tag: "MissingSkillMd";
      readonly code: "E001";
      readonly path: string;
    }
  | {
      readonly _tag: "InvalidFrontmatter";
      readonly code: "E002";
      readonly errors: readonly string[];
    }
  | {
      readonly _tag: "NameMismatch";
      readonly code: "E003";
      readonly frontmatterName: string;
      readonly directoryName: string;
    }
  | { readonly _tag: "MissingDescription"; readonly code: "W001" }
  | { readonly _tag: "Orphaned"; readonly code: "W002" }
  | {
      readonly _tag: "Missing";
      readonly code: "E004";
      readonly expected: LockedSkill;
    }
  | {
      readonly _tag: "HashMismatch";
      readonly code: "E005";
      readonly expected: string;
      readonly actual: string;
    }
  | {
      readonly _tag: "Incomplete";
      readonly code: "E006";
      readonly reason: string;
    }
  | { readonly _tag: "Multiple"; readonly issues: readonly SkillValidity[] };

// Constructors: simple factory functions for convenience
export const SkillValidity = {
  Valid: (): SkillValidity => ({ _tag: "Valid" }),
  MissingSkillMd: (args: { path: string }): SkillValidity => ({
    _tag: "MissingSkillMd",
    code: "E001",
    ...args,
  }),
  InvalidFrontmatter: (args: { errors: readonly string[] }): SkillValidity => ({
    _tag: "InvalidFrontmatter",
    code: "E002",
    ...args,
  }),
  NameMismatch: (args: {
    frontmatterName: string;
    directoryName: string;
  }): SkillValidity => ({ _tag: "NameMismatch", code: "E003", ...args }),
  MissingDescription: (): SkillValidity => ({
    _tag: "MissingDescription",
    code: "W001",
  }),
  Orphaned: (): SkillValidity => ({ _tag: "Orphaned", code: "W002" }),
  Missing: (args: { expected: LockedSkill }): SkillValidity => ({
    _tag: "Missing",
    code: "E004",
    ...args,
  }),
  HashMismatch: (args: {
    expected: string;
    actual: string;
  }): SkillValidity => ({ _tag: "HashMismatch", code: "E005", ...args }),
  Incomplete: (args: { reason: string }): SkillValidity => ({
    _tag: "Incomplete",
    code: "E006",
    ...args,
  }),
  Multiple: (args: { issues: readonly SkillValidity[] }): SkillValidity => ({
    _tag: "Multiple",
    ...args,
  }),
} as const;

/**
 * Schema for JSON serialization of SkillValidity.
 * Uses TaggedUnion for cleaner syntax.
 */
export const SkillValiditySchema: Schema.Schema<SkillValidity> = Schema.Union(
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
    expected: LockedSkillSchema,
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
    issues: Schema.Array(Schema.suspend(() => SkillValiditySchema)),
  }),
);

export type ValiditySeverity = "error" | "warning" | "info";

/** Derive severity from validity code prefix. */
export const severityFromCode = (code: SkillValidityCode): ValiditySeverity =>
  code.startsWith("E") ? "error" : code.startsWith("W") ? "warning" : "info";

/** Extract code from validity (Valid has no code). Uses exhaustive switch. */
export const getValidityCode = (v: SkillValidity): SkillValidityCode | null => {
  switch (v._tag) {
    case "Valid":
      return null;
    case "MissingSkillMd":
    case "InvalidFrontmatter":
    case "NameMismatch":
    case "MissingDescription":
    case "Orphaned":
    case "Missing":
    case "HashMismatch":
    case "Incomplete":
      return v.code;
    case "Multiple":
      return v.issues[0] ? getValidityCode(v.issues[0]) : null;
  }
};

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

// Schema for JSON serialization
export const SkillStateSchema = Schema.Struct({
  name: Schema.String,
  actual: Schema.OptionFromNullOr(ActualSkillSchema),
  locked: Schema.OptionFromNullOr(LockedSkillSchema),
  validity: SkillValiditySchema,
});

// Skills stored as Record for O(1) lookups and immutable updates
export interface SkillsState {
  readonly skills: Readonly<Record<string, SkillState>>;
}

export const SkillsStateSchema = Schema.Struct({
  skills: Schema.Record({ key: Schema.String, value: SkillStateSchema }),
});

// =============================================================================
// Workspace State (top-level container)
// =============================================================================

export type WorkspaceLevel = "project" | "user";

/**
 * Complete state of an axm workspace.
 * Aggregates all extension states.
 *
 * Works for both levels:
 * - Project level: axmDir = ".axm/", extensions in project
 * - User level (--global): axmDir = "~/.axm/", extensions at user level
 *
 * The same state model applies; only paths differ.
 *
 * Note: Settings changes are captured within extension changes (e.g., SkillChange
 * includes the settings entry that will be added/removed). Settings is not tracked
 * as a separate state—it's derived from extension state.
 */
export interface WorkspaceState {
  readonly level: WorkspaceLevel;
  readonly axmDir: string;
  readonly skills: SkillsState;
  readonly commands: CommandsState;
  readonly mcpServers: McpServersState;
  readonly packs: PacksState;
  readonly loadedAt: Date;
}

// Schema for JSON serialization
export const WorkspaceStateSchema = Schema.Struct({
  level: Schema.Literal("project", "user"),
  axmDir: Schema.String,
  skills: SkillsStateSchema,
  commands: CommandsStateSchema,
  mcpServers: McpServersStateSchema,
  packs: PacksStateSchema,
  loadedAt: Schema.Date,
});

// =============================================================================
// Other Extension Types (follow same pattern as Skills)
// =============================================================================

// Commands: Shell commands with aliases
// Actual: { name, path, content, aliases, lastModified }
// Locked: { source, origin, aliases, gitTreeFolderHash, installedAt, updatedAt }
// Validity: Valid | MissingCommandFile | InvalidManifest | Orphaned | Missing | HashMismatch

// MCP Servers: Model Context Protocol server configurations
// Actual: { name, path, config, lastModified }
// Locked: { source, origin, config, installedAt, updatedAt }
// Validity: Valid | InvalidConfig | Orphaned | Missing | ConfigMismatch

// Packs: Bundles of skills/commands/mcps
// Actual: { name, path, manifest, members, lastModified }
// Locked: { source, origin, version, members, installedAt, updatedAt }
// Validity: Valid | InvalidManifest | MissingMembers | Orphaned | Missing
//
// Pack installation writes multiple files but is not atomic.
// Partial pack installation results in Incomplete validity.

// =============================================================================
// Ideal State (desired after operation)
// =============================================================================

/**
 * Skill source types as discriminated union.
 * Use exhaustive switch for pattern matching.
 */
export type SkillSource =
  | { readonly _tag: "Local"; readonly path: string }
  | {
      readonly _tag: "Git";
      readonly url: string;
      readonly ref: Option.Option<string>;
      readonly subpath: Option.Option<string>;
    }
  | {
      readonly _tag: "WellKnown";
      readonly baseUrl: string;
      readonly skillName: string;
    }
  | {
      readonly _tag: "Registry";
      readonly name: string;
      readonly version: string;
    };

// Constructors
export const SkillSource = {
  Local: (args: { path: string }): SkillSource => ({ _tag: "Local", ...args }),
  Git: (args: {
    url: string;
    ref: Option.Option<string>;
    subpath: Option.Option<string>;
  }): SkillSource => ({ _tag: "Git", ...args }),
  WellKnown: (args: { baseUrl: string; skillName: string }): SkillSource => ({
    _tag: "WellKnown",
    ...args,
  }),
  Registry: (args: { name: string; version: string }): SkillSource => ({
    _tag: "Registry",
    ...args,
  }),
} as const;

/** Schema for JSON serialization of SkillSource. */
export const SkillSourceSchema = Schema.Union(
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

/**
 * Desired state for a skill after an operation.
 *
 * The source field serves dual purpose:
 * 1. Where to fetch the skill from (for install/update)
 * 2. What to write to settings.json (the settings entry value)
 *
 * This means SkillChange.Add implicitly includes the settings change—
 * no separate SettingsDiff needed.
 */
export interface IdealSkill {
  readonly name: string;
  readonly source: SkillSource;
  readonly gitTreeFolderHash: string;
  readonly description: Option.Option<string>;
  readonly agents: readonly string[];
}

export const IdealSkillSchema = Schema.Struct({
  name: Schema.String,
  source: SkillSourceSchema,
  gitTreeFolderHash: Schema.String,
  description: Schema.OptionFromNullOr(Schema.String),
  agents: Schema.Array(Schema.String),
});

export interface IdealSkillsState {
  readonly skills: Readonly<Record<string, IdealSkill>>;
  readonly removals: readonly string[]; // Immutable array of names to remove
}

export const IdealSkillsStateSchema = Schema.Struct({
  skills: Schema.Record({ key: Schema.String, value: IdealSkillSchema }),
  removals: Schema.Array(Schema.String),
});

/**
 * Complete ideal state for a project workspace.
 *
 * Note: No separate settings field. Settings changes are derived from
 * extension changes (e.g., adding a skill implies adding its settings entry).
 */
export interface IdealWorkspaceState {
  readonly skills: IdealSkillsState;
  readonly commands: IdealCommandsState; // defined similarly
  readonly mcpServers: IdealMcpServersState;
  readonly packs: IdealPacksState;
}

export const IdealWorkspaceStateSchema = Schema.Struct({
  skills: IdealSkillsStateSchema,
  commands: IdealCommandsStateSchema,
  mcpServers: IdealMcpServersStateSchema,
  packs: IdealPacksStateSchema,
});

// =============================================================================
// Diff / Plan
// =============================================================================

/**
 * Skill change types as discriminated union.
 * Use exhaustive switch for pattern matching.
 */
export type SkillChange =
  | { readonly _tag: "Add"; readonly skill: IdealSkill }
  | {
      readonly _tag: "Update";
      readonly from: SkillState;
      readonly to: IdealSkill;
    }
  | { readonly _tag: "Remove"; readonly skill: SkillState }
  | { readonly _tag: "Unchanged"; readonly skill: SkillState }
  | {
      readonly _tag: "Repair";
      readonly skill: SkillState;
      readonly target: IdealSkill;
    };

// Constructors
export const SkillChange = {
  Add: (args: { skill: IdealSkill }): SkillChange => ({ _tag: "Add", ...args }),
  Update: (args: { from: SkillState; to: IdealSkill }): SkillChange => ({
    _tag: "Update",
    ...args,
  }),
  Remove: (args: { skill: SkillState }): SkillChange => ({
    _tag: "Remove",
    ...args,
  }),
  Unchanged: (args: { skill: SkillState }): SkillChange => ({
    _tag: "Unchanged",
    ...args,
  }),
  Repair: (args: { skill: SkillState; target: IdealSkill }): SkillChange => ({
    _tag: "Repair",
    ...args,
  }),
} as const;

/** Schema for JSON serialization of SkillChange. */
export const SkillChangeSchema = Schema.Union(
  Schema.TaggedStruct("Add", { skill: IdealSkillSchema }),
  Schema.TaggedStruct("Update", {
    from: SkillStateSchema,
    to: IdealSkillSchema,
  }),
  Schema.TaggedStruct("Remove", { skill: SkillStateSchema }),
  Schema.TaggedStruct("Unchanged", { skill: SkillStateSchema }),
  Schema.TaggedStruct("Repair", {
    skill: SkillStateSchema,
    target: IdealSkillSchema,
  }),
);

export interface DiffSummary {
  readonly add: number;
  readonly update: number;
  readonly remove: number;
  readonly unchanged: number;
  readonly repair: number;
}

export const DiffSummarySchema = Schema.Struct({
  add: Schema.Number,
  update: Schema.Number,
  remove: Schema.Number,
  unchanged: Schema.Number,
  repair: Schema.Number,
});

export interface SkillsDiff {
  readonly changes: Readonly<Record<string, SkillChange>>;
  readonly summary: DiffSummary;
}

export const SkillsDiffSchema = Schema.Struct({
  changes: Schema.Record({ key: Schema.String, value: SkillChangeSchema }),
  summary: DiffSummarySchema,
});

// =============================================================================
// Workspace Diff (combined)
// =============================================================================

/**
 * Combined diff for all extension types.
 *
 * Note: No separate settings diff. Settings changes are implicit in extension
 * changes (e.g., SkillChange.Add includes the source that becomes the settings entry).
 */
export interface WorkspaceDiff {
  readonly skills: SkillsDiff;
  readonly commands: CommandsDiff; // defined similarly
  readonly mcpServers: McpServersDiff;
  readonly packs: PacksDiff;
}

export const WorkspaceDiffSchema = Schema.Struct({
  skills: SkillsDiffSchema,
  commands: CommandsDiffSchema,
  mcpServers: McpServersDiffSchema,
  packs: PacksDiffSchema,
});

// =============================================================================
// Agent Sync (computed separately, hidden from plan output)
// =============================================================================

/**
 * Sync method determined by platform detection:
 * - symlink: Unix-like systems (macOS, Linux)
 * - copy: Windows
 */
export type SyncMethod = "symlink" | "copy";

/**
 * Agent sync status as discriminated union.
 * Use exhaustive switch for pattern matching.
 */
export type AgentSyncStatus =
  | { readonly _tag: "Synced"; readonly method: SyncMethod }
  | { readonly _tag: "Missing" }
  | {
      readonly _tag: "Stale";
      readonly expected: string;
      readonly actual: string;
    }
  | {
      readonly _tag: "BrokenSymlink";
      readonly link: string;
      readonly target: string;
    };

// Constructors
export const AgentSyncStatus = {
  Synced: (args: { method: SyncMethod }): AgentSyncStatus => ({
    _tag: "Synced",
    ...args,
  }),
  Missing: (): AgentSyncStatus => ({ _tag: "Missing" }),
  Stale: (args: { expected: string; actual: string }): AgentSyncStatus => ({
    _tag: "Stale",
    ...args,
  }),
  BrokenSymlink: (args: { link: string; target: string }): AgentSyncStatus => ({
    _tag: "BrokenSymlink",
    ...args,
  }),
} as const;

/** Schema for JSON serialization of AgentSyncStatus. */
export const AgentSyncStatusSchema = Schema.Union(
  Schema.TaggedStruct("Synced", { method: Schema.Literal("symlink", "copy") }),
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

export interface SkillSyncState {
  readonly skillName: string;
  readonly canonicalPath: string;
  readonly agents: Readonly<Record<string, AgentSyncStatus>>; // agentId -> status
}

export const SkillSyncStateSchema = Schema.Struct({
  skillName: Schema.String,
  canonicalPath: Schema.String,
  agents: Schema.Record({ key: Schema.String, value: AgentSyncStatusSchema }),
});
```

---

## State Loading

```typescript
// packages/core/src/skills/state/load.ts

import { Array, Effect, Option, pipe, Record } from "effect";
import type { FileSystem } from "@effect/platform";
import {
  SkillValidity,
  type ActualSkill,
  type LockedSkill,
  type SkillsState,
  type SkillState,
  type WorkspaceLevel,
  type WorkspaceState,
} from "./types.js";
import { LoadError } from "./apply.js";

/**
 * Load complete skills state: actual + locked + computed validity.
 *
 * Pre-condition: Workspace must be initialized (axmDir exists).
 * Initialization is verified before state loading.
 *
 * Lockfile handling:
 * - If axm-lock.yaml fails to parse, treat as empty lockfile with warning.
 * - User can run `axm sync` to rebuild from actual state.
 */
export const loadSkillsState = (
  axmDir: string,
): Effect.Effect<SkillsState, LoadError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // Load actual and locked in parallel
    // Returns Record<string, ActualSkill> and Record<string, LockedSkill>
    const [actualRecord, lockedRecord] = yield* Effect.all([
      loadActualSkills(axmDir),
      loadLockedSkills(axmDir),
    ]);

    // Merge keys from both records and build state
    const allNames = pipe(
      [...Object.keys(actualRecord), ...Object.keys(lockedRecord)],
      Array.dedupe,
    );

    const skills = pipe(
      allNames,
      Array.map((name) => {
        const actual = Option.fromNullable(actualRecord[name]);
        const locked = Option.fromNullable(lockedRecord[name]);
        const validity = computeValidity(actual, locked);
        return [name, { name, actual, locked, validity }] as const;
      }),
      Record.fromEntries,
    );

    return { skills, axmDir, loadedAt: new Date() };
  });

/**
 * Compute validity by comparing actual vs locked state.
 * Uses Option.match for type-safe handling without throwing.
 *
 * Pre-condition: At least one of actual or locked must be Some.
 * This is guaranteed by the merge logic in loadSkillsState which
 * only creates entries for skills that exist in actual or locked maps.
 */
const computeValidity = (
  actual: Option.Option<ActualSkill>,
  locked: Option.Option<LockedSkill>,
): SkillValidity =>
  Option.match(actual, {
    // No actual state on disk
    onNone: () =>
      Option.match(locked, {
        // Unreachable: merge only creates entries when actual or locked exists
        onNone: () => SkillValidity.Valid(),
        onSome: (l) => SkillValidity.Missing({ expected: l }),
      }),
    // Actual state exists
    onSome: (a) =>
      Option.match(locked, {
        onNone: () => SkillValidity.Orphaned(),
        onSome: (l) => compareActualAndLocked(a, l),
      }),
  });

/**
 * Compare actual and locked state when both exist.
 * Collects all validation issues into a single validity result.
 */
const compareActualAndLocked = (
  a: ActualSkill,
  l: LockedSkill,
): SkillValidity => {
  const issues = pipe(
    [
      // Missing SKILL.md
      a.content === ""
        ? Option.some(
            SkillValidity.MissingSkillMd({ path: `${a.path}/SKILL.md` }),
          )
        : Option.none(),

      // Invalid frontmatter
      Option.isNone(a.frontmatter) && a.content !== ""
        ? Option.some(
            SkillValidity.InvalidFrontmatter({ errors: ["Failed to parse"] }),
          )
        : Option.none(),

      // Name mismatch (only if frontmatter exists)
      pipe(
        a.frontmatter,
        Option.flatMap((fm) =>
          fm.name && fm.name !== a.name
            ? Option.some(
                SkillValidity.NameMismatch({
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
            ? Option.some(SkillValidity.MissingDescription())
            : Option.none(),
        ),
      ),

      // Hash mismatch
      a.gitTreeFolderHash !== l.gitTreeFolderHash
        ? Option.some(
            SkillValidity.HashMismatch({
              expected: l.gitTreeFolderHash,
              actual: a.gitTreeFolderHash,
            }),
          )
        : Option.none(),
    ],
    Array.getSomes,
  );

  return pipe(
    issues,
    Array.match({
      onEmpty: () => SkillValidity.Valid(),
      onNonEmpty: (nonEmpty) =>
        nonEmpty.length === 1
          ? nonEmpty[0]
          : SkillValidity.Multiple({ issues: nonEmpty }),
    }),
  );
};

/**
 * Load complete workspace state: all extension types.
 */
export const loadWorkspaceState = (
  axmDir: string,
  level: WorkspaceLevel,
): Effect.Effect<WorkspaceState, LoadError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // Load all extension states in parallel
    const [skills, commands, mcpServers, packs] = yield* Effect.all([
      loadSkillsState(axmDir),
      loadCommandsState(axmDir),
      loadMcpServersState(axmDir),
      loadPacksState(axmDir),
    ]);

    return {
      level,
      axmDir,
      skills,
      commands,
      mcpServers,
      packs,
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
import type { FileSystem } from "@effect/platform";
import type { HttpClient } from "@effect/platform";
import {
  SkillSource,
  type IdealSkill,
  type IdealSkillsState,
  type LockedSkill,
  type SkillsState,
  type SkillState,
} from "./types.js";
import type { BuildIdealError } from "./apply.js";

/** Convert existing skill state to ideal representation. */
const stateToIdeal = (state: SkillState): IdealSkill =>
  Option.match(state.locked, {
    onNone: () => {
      // Orphaned skill - use actual data to build ideal
      const actual = Option.getOrThrow(state.actual);
      return {
        name: state.name,
        source: SkillSource.Local({ path: actual.path }),
        gitTreeFolderHash: actual.gitTreeFolderHash,
        description: pipe(
          actual.frontmatter,
          Option.flatMap((fm) => Option.fromNullable(fm.description)),
        ),
        agents: [],
      };
    },
    onSome: (locked) => ({
      name: state.name,
      source: SkillSource.Git({
        url: locked.source,
        ref: locked.ref,
        subpath: locked.path,
      }),
      gitTreeFolderHash: locked.gitTreeFolderHash,
      description: Option.none(),
      agents: [],
    }),
  });

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
    // Note: toUpdate is pre-filtered to only include skills with locked state
    const updatedSkills = yield* pipe(
      toUpdate,
      Array.filterMap(([name, state]) =>
        Option.map(state.locked, (locked) => [name, state, locked] as const),
      ),
      Effect.forEach(
        ([name, _state, locked]) =>
          pipe(
            fetchLatestVersion(locked),
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
import {
  SkillChange,
  type IdealSkillsState,
  type SkillsDiff,
  type SkillsState,
  type SkillValidity,
} from "./types.js";

/** Check if validity indicates the skill needs repair (not just warnings). Uses exhaustive switch. */
const needsRepair = (validity: SkillValidity): boolean => {
  switch (validity._tag) {
    case "Valid":
    case "MissingDescription": // Warning only
    case "HashMismatch": // Handled as Update
      return false;
    case "MissingSkillMd":
    case "InvalidFrontmatter":
    case "NameMismatch":
    case "Orphaned":
    case "Missing":
    case "Incomplete":
    case "Multiple":
      return true;
  }
};

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
      if (needsRepair(currentState.validity)) {
        return [
          name,
          SkillChange.Repair({ skill: currentState, target: idealSkill }),
        ] as const;
      }

      // Hash differs -> Update (using Option.match instead of getOrThrow)
      const hashMismatch = Option.match(currentState.actual, {
        onNone: () => false,
        onSome: (actual) =>
          actual.gitTreeFolderHash !== idealSkill.gitTreeFolderHash,
      });

      if (hashMismatch) {
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

  // Compute summary from changes using exhaustive switch
  const summary = pipe(
    Object.values(changes),
    Array.reduce(
      { add: 0, update: 0, remove: 0, unchanged: 0, repair: 0 },
      (acc, change) => {
        switch (change._tag) {
          case "Add":
            return { ...acc, add: acc.add + 1 };
          case "Update":
            return { ...acc, update: acc.update + 1 };
          case "Remove":
            return { ...acc, remove: acc.remove + 1 };
          case "Unchanged":
            return { ...acc, unchanged: acc.unchanged + 1 };
          case "Repair":
            return { ...acc, repair: acc.repair + 1 };
        }
      },
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
    + @skills/commit       github:org/skills@v1.0.0  (add)
    ~ @skills/review-pr    abc123 → def456           (update)
    ! @skills/broken                                 (repair)
    - @skills/deprecated                             (remove)

  Summary: 1 to add, 1 to update, 1 to repair, 1 to remove
```

### Display Rules

1. **Unchanged items are hidden** — only show what will change
2. **Agent sync is hidden** — implementation detail, not user-facing
3. **Symbols**: `+` add, `~` update, `!` repair, `-` remove
4. **Hash preview**: Show short hashes for updates (first 7 chars)
5. **Source shown for adds** — shows where the skill comes from (also the settings entry value)
6. **No separate settings section** — settings changes are implicit in extension changes

### JSON Output (`--json`)

Internal state uses `Record<string, SkillChange>` for O(1) lookups and immutable updates. JSON output transforms to arrays for CLI consumers (easier to iterate, no key duplication).

```json
{
  "skills": {
    "changes": [
      {
        "_tag": "Add",
        "name": "@skills/commit",
        "source": { "_tag": "Git", "url": "github:org/repo", "ref": "v1.0.0" }
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
  }
}
```

Effect Schema transformation for JSON encoding:

```typescript
// Internal: Record for O(1) lookups and immutable updates
const SkillsDiffInternalSchema = Schema.Struct({
  changes: Schema.Record({ key: Schema.String, value: SkillChangeSchema }),
  summary: DiffSummarySchema,
});

// JSON output type: change with name field for array representation
interface SkillChangeWithName {
  readonly name: string;
  readonly change: SkillChange;
}

const SkillChangeWithNameSchema = Schema.Struct({
  name: Schema.String,
  change: SkillChangeSchema,
});

const SkillsDiffJsonSchema = Schema.Struct({
  changes: Schema.Array(SkillChangeWithNameSchema),
  summary: DiffSummarySchema,
});

// Transform between representations
export const SkillsDiffOutputSchema = SkillsDiffInternalSchema.pipe(
  Schema.transform(SkillsDiffJsonSchema, {
    decode: (internal) => ({
      ...internal,
      changes: pipe(
        Object.entries(internal.changes),
        Array.map(([name, change]) => ({ name, change })),
      ),
    }),
    encode: (json) => ({
      ...json,
      changes: pipe(
        json.changes,
        Array.map((c) => [c.name, c.change] as const),
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

import {
  Array,
  Data,
  Effect,
  Exit,
  Option,
  pipe,
  Record,
  Schema,
} from "effect";

// =============================================================================
// Progress Events
// =============================================================================

export type ApplyAction = "add" | "update" | "remove" | "repair";

/**
 * Progress events as discriminated union.
 * Use exhaustive switch for pattern matching.
 */
export type ApplyProgressEvent =
  | {
      readonly _tag: "StartingSkill";
      readonly name: string;
      readonly action: ApplyAction;
    }
  | {
      readonly _tag: "CompletedSkill";
      readonly name: string;
      readonly action: ApplyAction;
    }
  | {
      readonly _tag: "FailedSkill";
      readonly name: string;
      readonly error: string;
    }
  | {
      readonly _tag: "SyncingAgent";
      readonly skillName: string;
      readonly agentId: string;
    }
  | { readonly _tag: "UpdatingSettings" }
  | { readonly _tag: "UpdatingLockfile" };

// Constructors
export const ApplyProgressEvent = {
  StartingSkill: (args: {
    name: string;
    action: ApplyAction;
  }): ApplyProgressEvent => ({ _tag: "StartingSkill", ...args }),
  CompletedSkill: (args: {
    name: string;
    action: ApplyAction;
  }): ApplyProgressEvent => ({ _tag: "CompletedSkill", ...args }),
  FailedSkill: (args: { name: string; error: string }): ApplyProgressEvent => ({
    _tag: "FailedSkill",
    ...args,
  }),
  SyncingAgent: (args: {
    skillName: string;
    agentId: string;
  }): ApplyProgressEvent => ({ _tag: "SyncingAgent", ...args }),
  UpdatingSettings: (): ApplyProgressEvent => ({ _tag: "UpdatingSettings" }),
  UpdatingLockfile: (): ApplyProgressEvent => ({ _tag: "UpdatingLockfile" }),
} as const;

/** Schema for JSON serialization of ApplyProgressEvent. */
export const ApplyProgressEventSchema = Schema.Union(
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

// =============================================================================
// Apply Result
// =============================================================================

export interface ApplyResult {
  readonly applied: Readonly<Record<string, AppliedChange>>;
  readonly failed: Readonly<Record<string, ApplyError>>;
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

// =============================================================================
// Errors (Data.TaggedError with retryable field)
// =============================================================================

export class ApplyError extends Data.TaggedError("ApplyError")<{
  readonly message: string;
  readonly skillName: string;
  readonly cause?: unknown;
  readonly retryable: boolean;
}> {}

export class LoadError extends Data.TaggedError("LoadError")<{
  readonly message: string;
  readonly path: string;
  readonly cause?: unknown;
  readonly retryable: boolean; // true for IO errors, false for parse errors
}> {}

export class BuildIdealError extends Data.TaggedError("BuildIdealError")<{
  readonly message: string;
  readonly cause?: unknown;
  readonly retryable: boolean;
}> {}

/**
 * Apply diff to make actual state match ideal state.
 *
 * Apply order (sequential to maintain consistency):
 * 1. Apply skill file changes (copy/remove from canonical location)
 * 2. Sync to agents (symlinks/copies to agent directories)
 * 3. Update settings.json
 * 4. Update lockfile (last, as source of truth)
 *
 * Failure and cancellation handling:
 * Uses Effect.acquireRelease to create a checkpoint before applying.
 * On failure or Ctrl+C interruption, the checkpoint is restored.
 * Effect's interruption model handles cancellation automatically.
 */
export const applyDiff = (
  diff: WorkspaceDiff,
  options: ApplyOptions,
): Effect.Effect<ApplyResult, ApplyError, FileSystem.FileSystem | Path.Path> =>
  Effect.acquireRelease(
    createCheckpoint(options.axmDir), // Snapshot current state
    (checkpoint, exit) =>
      Exit.isFailure(exit)
        ? restoreCheckpoint(checkpoint) // Rollback on failure/interruption
        : Effect.void,
  ).pipe(Effect.flatMap(() => applyDiffImpl(diff, options)));

/** Type guard for Unchanged changes. Simple inline check. */
const isUnchanged = (
  change: SkillChange,
): change is SkillChange & { _tag: "Unchanged" } => change._tag === "Unchanged";

/** Type guard for Remove changes. Simple inline check. */
const isRemove = (
  change: SkillChange,
): change is SkillChange & { _tag: "Remove" } => change._tag === "Remove";

const applyDiffImpl = (
  diff: WorkspaceDiff,
  options: ApplyOptions,
): Effect.Effect<ApplyResult, ApplyError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    // Phase 1: Apply skill file changes
    // Note: Sequential here because we want progress events in order.
    // For truly independent operations, use { concurrency: "unbounded" }
    const changesToApply = pipe(
      Object.entries(diff.skills.changes),
      Array.filter(([_, change]) => !isUnchanged(change)),
    );

    const appliedEntries = yield* Effect.forEach(
      changesToApply,
      ([name, change]) =>
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

          return [name, result] as const;
        }),
      { concurrency: 1 }, // Sequential for ordered progress; use "unbounded" if order doesn't matter
    );

    const applied = Object.fromEntries(appliedEntries);

    // Phase 2: Sync to agents (after all files are in place)
    const skillsToSync = pipe(
      Object.entries(diff.skills.changes),
      Array.filter(([_, change]) => !isUnchanged(change) && !isRemove(change)),
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

    // Phase 3: Update settings.json (derived from extension changes)
    // Settings entries are added/removed based on skill changes
    yield* Effect.if(Object.keys(applied).length > 0, {
      onTrue: () =>
        Effect.gen(function* () {
          options.onProgress?.(ApplyProgressEvent.UpdatingSettings());
          yield* updateSettingsFromChanges(diff.skills.changes, options.axmDir);
        }),
      onFalse: () => Effect.void,
    });

    // Phase 4: Update lockfile (last, as source of truth)
    yield* Effect.if(Object.keys(applied).length > 0, {
      onTrue: () =>
        Effect.gen(function* () {
          options.onProgress?.(ApplyProgressEvent.UpdatingLockfile());
          yield* updateLockfile(options.axmDir, diff, applied);
        }),
      onFalse: () => Effect.void,
    });

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

/** Error for attempting to apply an unchanged skill (programming error). Uses Data.TaggedError. */
class UnchangedSkillApplied extends Data.TaggedError("UnchangedSkillApplied")<{
  readonly name: string;
  readonly retryable: false; // Always false - programming error
}> {}

/** Apply a single change using exhaustive switch. */
const applyChange = (
  change: SkillChange,
  options: ApplyOptions,
): Effect.Effect<
  AppliedChange,
  ApplyError | UnchangedSkillApplied,
  FileSystem.FileSystem | Path.Path
> => {
  switch (change._tag) {
    case "Add":
      return applyAdd(change.skill, options);
    case "Update":
      return applyUpdate(change.from, change.to, options);
    case "Remove":
      return applyRemove(change.skill, options);
    case "Repair":
      return applyRepair(change.skill, change.target, options);
    case "Unchanged":
      return Effect.fail(
        new UnchangedSkillApplied({
          name: change.skill.name,
          retryable: false,
        }),
      );
  }
};

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
    // For remote sources, this clones to a temp directory to analyze contents.
    // Dry-run messaging: "Fetching source to analyze contents..."
    spinner.start(
      args.dryRun
        ? "Fetching source to analyze contents..."
        : "Resolving source...",
    );
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

/** Type guard for Valid state. Simple inline check. */
const isValid = (v: SkillValidity): v is SkillValidity & { _tag: "Valid" } =>
  v._tag === "Valid";

/** Type guard for BrokenSymlink status. Simple inline check. */
const isBrokenSymlink = (
  s: AgentSyncStatus,
): s is AgentSyncStatus & { _tag: "BrokenSymlink" } =>
  s._tag === "BrokenSymlink";

export const handleDoctor = () =>
  Effect.gen(function* () {
    const axmDir = yield* findAxmDir();
    const current = yield* loadSkillsState(axmDir);

    // Collect skill validity issues
    const skillIssues = pipe(
      Object.entries(current.skills),
      Array.filterMap(([name, state]) =>
        state.validity._tag === "Valid"
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
            status._tag === "BrokenSymlink"
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
    expect(skill.validity._tag).toBe("Orphaned");
  });

  it("detects missing skills", async () => {
    // Skill in lockfile but not on disk
    const state = await Effect.runPromise(
      loadSkillsState("/test/.axm").pipe(
        Effect.provide(TestLayerWithMissingSkill),
      ),
    );

    const skill = state.skills.get("missing-skill");
    expect(skill.validity._tag).toBe("Missing");
  });

  it("detects hash mismatch", async () => {
    const state = await Effect.runPromise(
      loadSkillsState("/test/.axm").pipe(
        Effect.provide(TestLayerWithModifiedSkill),
      ),
    );

    const skill = state.skills.get("modified-skill");
    expect(skill.validity._tag).toBe("HashMismatch");
  });
});
```

### Unit Tests: Diff Computation

```typescript
describe("computeDiff", () => {
  it("identifies additions", () => {
    const current: SkillsState = {
      skills: {},
      axmDir: "/test",
      loadedAt: new Date(),
    };
    const ideal: IdealSkillsState = {
      skills: { "new-skill": mockIdealSkill("new-skill") },
      removals: [],
    };

    const diff = computeDiff(current, ideal);

    expect(diff.summary.add).toBe(1);
    expect(diff.changes["new-skill"]._tag).toBe("Add");
  });

  it("identifies no changes when actual matches ideal", () => {
    const current = mockCurrentStateWithSkill("existing");
    const ideal = mockIdealStateWithSkill(
      "existing",
      current.skills["existing"],
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

| Decision            | Choice                                           | Rationale                                                                  |
| ------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| Architecture        | State diffing (Arborist-style)                   | Unified validation, natural idempotency, reusable for doctor/sync          |
| State separation    | actual + locked → merged with validity           | Clear provenance, supports all comparison scenarios                        |
| Per-type state      | SkillState, CommandState, etc.                   | Type-specific validation, manifests, behaviors                             |
| Tagged unions       | Plain interfaces + Schema.Union of TaggedStructs | Simple domain types; Schema only for JSON serialization                    |
| Pattern matching    | Exhaustive switch statements                     | TypeScript catches missing cases; simpler than Match.valueTags             |
| Type definitions    | Plain interfaces + Schema for serialization      | Interfaces for domain; Schema at boundaries for JSON/validation            |
| Locked types        | Derived from LockEntry via Schema                | One source of truth; Schema handles string↔Date, optional↔Option           |
| Top-level container | WorkspaceState                                   | Aggregates all extension states for unified operations                     |
| Workspace level     | Same model for project and user                  | Only paths differ; `level` field distinguishes                             |
| Settings changes    | Derived from extension changes                   | SkillChange.Add includes source → settings entry; no separate SettingsDiff |
| Agent sync display  | Hidden from plan output                          | Implementation detail; plan focuses on extension changes                   |
| Agent sync          | Separate from extension state                    | Avoids N×M complexity, computed on demand                                  |
| Validity            | Discriminated union + Schema                     | Actionable errors, supports multiple issues, serializable                  |
| Diff as plan        | SkillChange discriminated union                  | Same display for dry-run and execution                                     |
| Apply phase         | Idempotent operations                            | Re-run fixes partial failures                                              |
| Discovery effects   | Allow git clone with messaging                   | Remote source contents needed for ideal state; messaging sets expectations |
| JSON output         | Record internally, array for JSON                | O(1) lookups internally; arrays easier for CLI consumers to iterate        |
| Data structures     | Immutable Record/Array (not Map/Set)             | FP-friendly; works with pipe/Array combinators; natural JSON serialization |
| Parallel apply      | Effect.forEach with concurrency option           | Cleaner than Effect.reduce; explicit concurrency control                   |
| Partial failure     | Stop on first error, return partial result       | User can inspect state and retry; lockfile only updated on full success    |
| Agent sync timing   | After all files in place, before lockfile        | Ensures files exist before syncing; sync failure stops before lockfile     |
| Validity codes      | Static codes per variant (E001, W001)            | Stable IDs for docs, automation, suppression; severity from prefix         |
| Folder hash         | Git tree hash                                    | Deterministic, cross-platform; computed using git's tree object algorithm  |
| Source resolution   | Existing `source-parser.ts` + `resolution/`      | Proven patterns; supports GitHub, GitLab, local paths, well-known URLs     |
| Sync method         | Platform detection (symlink vs copy)             | Symlinks on Unix-like; copies on Windows                                   |
| Corrupted lockfile  | Treat as empty with warning                      | User can run `axm sync` to rebuild from actual state                       |
| Workspace init      | Pre-condition verified before state load         | Simplifies state loading; init checked at command entry                    |
| Rollback on failure | Effect.acquireRelease with checkpoint            | Handles both errors and Ctrl+C interruption; restore on failure            |
| Dry-run messaging   | "Fetching source to analyze contents..."         | Sets expectations for remote clones during dry-run                         |
| Pack atomicity      | Not atomic; partial = Incomplete validity        | Multiple files; partial installation detected and reported                 |
| Error handling      | Data.TaggedError with retryable field            | Typed errors; retryable enables consistent retry policies                  |
| Error recovery      | Effect.catchTag over Effect.either               | Type-safe recovery by error tag; cleaner composition than Either matching  |
| Record construction | Record.fromIterableWith                          | Single-pass construction; cleaner than Array.map + Record.fromEntries      |
| Conditional effects | Effect.if over Effect.when with gen wrapper      | Explicit branches; avoids nested Effect.gen for conditional execution      |
| Option handling     | Option.match over Option.getOrThrow              | No throwing; explicit handling of both cases                               |
| Type guards         | Inline `_tag` checks                             | Simple and direct; no need for $is helpers                                 |
| Constructors        | Factory functions on const object                | Cleaner than Data.TaggedEnum; no runtime overhead                          |

---

## Open Questions

### Resolved

1. **State model**: Arborist-style with actual/locked/ideal ✓
2. **Per-type state**: Yes, each extension type has own types ✓
3. **Agent sync**: Separate concern, computed on demand ✓
4. **Validity**: Plain discriminated union + Schema for serialization ✓
5. **Locked types**: Derived from LockEntry schema via Effect Schema transformations ✓
6. **Type definitions**: Plain interfaces for domain, Schema at boundaries for serialization ✓
7. **Top-level container**: WorkspaceState aggregates all extension states + settings ✓
8. **Workspace level**: Same model for project and user; only paths differ ✓
9. **Settings changes**: Derived from extension changes; no separate SettingsState or SettingsDiff ✓
10. **Agent sync display**: Hidden from plan output; implementation detail ✓
11. **Discovery side effects**: Dry-run allows git clone to determine remote source contents, with clear messaging ✓
12. **JSON output**: Record internally, transform to array for JSON output ✓
13. **Apply phases**: Sequential (files → agent sync → settings → lockfile) for consistency ✓
14. **Partial failure**: Stop on first error; lockfile only updated on full success ✓
15. **Agent sync timing**: After files in place, before lockfile; failure stops apply ✓
16. **Validity codes**: Static codes per variant (E001, W001, etc.) for docs/automation ✓
17. **Staleness detection**: Non-goal ✓
18. **Folder hash**: Git tree hash for deterministic, cross-platform hashing ✓
19. **Source resolution**: Use existing `source-parser.ts` and `resolution/` modules ✓
20. **Sync method**: Platform detection (symlinks on Unix, copies on Windows) ✓
21. **Corrupted lockfile**: Treat as empty with warning; user can `axm sync` to rebuild ✓
22. **Workspace init**: Pre-condition verified before state loading ✓
23. **Rollback**: Effect.acquireRelease with checkpoint; handles failure and Ctrl+C ✓
24. **Dry-run messaging**: "Fetching source to analyze contents..." for remote clones ✓
25. **Pack atomicity**: Not atomic; partial installation results in Incomplete validity ✓

### Future Work

1. **Type-specific lock entries**: The current `LockEntry` schema is generic across all extension types. May need type-specific schemas (e.g., `SkillLockEntry`, `CommandLockEntry`) if extension types diverge in their lockfile fields (triggers for skills, aliases for commands, etc.).
