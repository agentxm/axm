/**
 * State types for skills management - actual, locked, ideal, diff/plan.
 *
 * This module implements an Arborist-style state model where:
 * - **Actual** state is what exists on disk
 * - **Locked** state is what the lockfile says should exist
 * - **Ideal** state is the desired state after an operation
 * - **Diff/Plan** is the set of changes to transform actual to ideal
 *
 * See docs/designs/dry-run.md for the reconciliation pattern.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Array from "effect/Array";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";

import type { Source } from "../../../sources/types.js";

// =============================================================================
// Skill Frontmatter
// =============================================================================

/**
 * Skill frontmatter parsed from SKILL.md.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillFrontmatter {
  readonly name: Option.Option<string>;
  readonly description: Option.Option<string>;
  readonly version: Option.Option<string>;
  readonly triggers: Option.Option<readonly string[]>;
}

/**
 * Schema for JSON serialization of SkillFrontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillFrontmatterSchema = Schema.Struct({
  name: Schema.OptionFromNullOr(Schema.String),
  description: Schema.OptionFromNullOr(Schema.String),
  version: Schema.OptionFromNullOr(Schema.String),
  triggers: Schema.OptionFromNullOr(Schema.Array(Schema.String)),
});

// =============================================================================
// Actual State (what's on disk)
// =============================================================================

/**
 * Skill as it exists on disk at canonical location (.axm/skills/<name>/).
 *
 * The gitTreeFolderHash is the git tree hash of the skill folder, computed using
 * git's tree object algorithm for deterministic, cross-platform hashing.
 *
 * @experimental This API is unstable and may change without notice.
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

/**
 * Schema for JSON serialization of ActualSkill.
 *
 * @experimental This API is unstable and may change without notice.
 */
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
 * @experimental This API is unstable and may change without notice.
 */
export interface LockedSkill {
  readonly source: string;
  readonly origin: string;
  readonly path: Option.Option<string>;
  readonly ref: Option.Option<string>;
  readonly version: Option.Option<string>;
  readonly gitTreeFolderHash: string;
  readonly agents: readonly string[];
  readonly installedAt: Date;
  readonly updatedAt: Date;
}

/**
 * Schema for JSON serialization of LockedSkill.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LockedSkillSchema = Schema.Struct({
  source: Schema.String,
  origin: Schema.String,
  path: Schema.OptionFromNullOr(Schema.String),
  ref: Schema.OptionFromNullOr(Schema.String),
  version: Schema.OptionFromNullOr(Schema.String),
  gitTreeFolderHash: Schema.String,
  agents: Schema.Array(Schema.String),
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
 *
 * @experimental This API is unstable and may change without notice.
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
 *
 * @experimental This API is unstable and may change without notice.
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

/**
 * Constructors for SkillValidity variants.
 *
 * @experimental This API is unstable and may change without notice.
 */
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
  NameMismatch: (args: { frontmatterName: string; directoryName: string }): SkillValidity => ({
    _tag: "NameMismatch",
    code: "E003",
    ...args,
  }),
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
  HashMismatch: (args: { expected: string; actual: string }): SkillValidity => ({
    _tag: "HashMismatch",
    code: "E005",
    ...args,
  }),
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
 * Schema for JSON serialization of SkillValidity (excluding Missing to avoid recursive Option issue).
 * Uses Union of TaggedStructs for cleaner syntax.
 *
 * Note: The Missing variant uses LockedSkillSchema which involves Option transformations,
 * making the Encoded type different from the Type. We use separate encode/decode for JSON.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillValiditySchema = Schema.Union(
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
    issues: Schema.Array(
      Schema.suspend(
        (): Schema.Schema<SkillValidity> => SkillValiditySchema as Schema.Schema<SkillValidity>,
      ),
    ),
  }),
);

/**
 * Validity severity levels.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ValiditySeverity = "error" | "warning" | "info";

/**
 * Derive severity from validity code prefix.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const severityFromCode = (code: SkillValidityCode): ValiditySeverity =>
  code.startsWith("E") ? "error" : code.startsWith("W") ? "warning" : "info";

/**
 * Extract code from validity (Valid has no code). Uses exhaustive switch.
 *
 * @experimental This API is unstable and may change without notice.
 */
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
      return Option.match(Array.head(v.issues), {
        onNone: () => null,
        onSome: (first) => getValidityCode(first),
      });
  }
};

// =============================================================================
// Issue Types (new reconciliation design)
// =============================================================================

/**
 * Issue severity levels.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Severity = "error" | "warning";

/**
 * Schema for issue severity.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SeveritySchema = Schema.Literal("error", "warning");

/**
 * Issues specific to a skill on disk.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ActualSkillIssue =
  | { readonly _tag: "MissingSkillMd"; readonly path: string; readonly severity: "error" }
  | {
      readonly _tag: "InvalidFrontmatter";
      readonly errors: ReadonlyArray<string>;
      readonly severity: "error";
    }
  | { readonly _tag: "MissingDescription"; readonly severity: "warning" };

/**
 * Constructors for ActualSkillIssue variants.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ActualSkillIssue = {
  MissingSkillMd: (args: { path: string }): ActualSkillIssue => ({
    _tag: "MissingSkillMd",
    path: args.path,
    severity: "error",
  }),
  InvalidFrontmatter: (args: { errors: ReadonlyArray<string> }): ActualSkillIssue => ({
    _tag: "InvalidFrontmatter",
    errors: args.errors,
    severity: "error",
  }),
  MissingDescription: (): ActualSkillIssue => ({
    _tag: "MissingDescription",
    severity: "warning",
  }),
} as const;

/**
 * Schema for ActualSkillIssue.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ActualSkillIssueSchema = Schema.Union(
  Schema.TaggedStruct("MissingSkillMd", {
    path: Schema.String,
    severity: Schema.Literal("error"),
  }),
  Schema.TaggedStruct("InvalidFrontmatter", {
    errors: Schema.Array(Schema.String),
    severity: Schema.Literal("error"),
  }),
  Schema.TaggedStruct("MissingDescription", {
    severity: Schema.Literal("warning"),
  }),
);

/**
 * Issues from comparing actual vs locked state.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillStateIssue =
  | { readonly _tag: "MissingFromDisk"; readonly name: string; readonly severity: "error" }
  | { readonly _tag: "NotInLockfile"; readonly name: string; readonly severity: "warning" };

/**
 * Constructors for SkillStateIssue variants.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillStateIssue = {
  MissingFromDisk: (args: { name: string }): SkillStateIssue => ({
    _tag: "MissingFromDisk",
    name: args.name,
    severity: "error",
  }),
  NotInLockfile: (args: { name: string }): SkillStateIssue => ({
    _tag: "NotInLockfile",
    name: args.name,
    severity: "warning",
  }),
} as const;

/**
 * Schema for SkillStateIssue.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillStateIssueSchema = Schema.Union(
  Schema.TaggedStruct("MissingFromDisk", {
    name: Schema.String,
    severity: Schema.Literal("error"),
  }),
  Schema.TaggedStruct("NotInLockfile", {
    name: Schema.String,
    severity: Schema.Literal("warning"),
  }),
);

/**
 * Workspace-level issues spanning multiple skills.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type WorkspaceIssue =
  | {
      readonly _tag: "DuplicateName";
      readonly name: string;
      readonly paths: ReadonlyArray<string>;
      readonly severity: "error";
    }
  | {
      readonly _tag: "OrphanedSettingsRef";
      readonly agent: string;
      readonly skill: string;
      readonly severity: "warning";
    };

/**
 * Constructors for WorkspaceIssue variants.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const WorkspaceIssue = {
  DuplicateName: (args: { name: string; paths: ReadonlyArray<string> }): WorkspaceIssue => ({
    _tag: "DuplicateName",
    name: args.name,
    paths: args.paths,
    severity: "error",
  }),
  OrphanedSettingsRef: (args: { agent: string; skill: string }): WorkspaceIssue => ({
    _tag: "OrphanedSettingsRef",
    agent: args.agent,
    skill: args.skill,
    severity: "warning",
  }),
} as const;

/**
 * Schema for WorkspaceIssue.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const WorkspaceIssueSchema = Schema.Union(
  Schema.TaggedStruct("DuplicateName", {
    name: Schema.String,
    paths: Schema.Array(Schema.String),
    severity: Schema.Literal("error"),
  }),
  Schema.TaggedStruct("OrphanedSettingsRef", {
    agent: Schema.String,
    skill: Schema.String,
    severity: Schema.Literal("warning"),
  }),
);

/**
 * Union of all issue types.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type AnyIssue = ActualSkillIssue | SkillStateIssue | WorkspaceIssue;

/**
 * Schema for AnyIssue union.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AnyIssueSchema = Schema.Union(
  ActualSkillIssueSchema,
  SkillStateIssueSchema,
  WorkspaceIssueSchema,
);

// =============================================================================
// Source re-export (unified source type from sources/types.ts)
// =============================================================================

// Re-export Source type from canonical location
export type { Source } from "../../../sources/types.js";

// =============================================================================
// ActualSkillV2, LockedSkillV2, SkillStateV2, CurrentState (new reconciliation design)
// =============================================================================

/**
 * Skill as it exists on disk (V2 - with issues array).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ActualSkillV2 {
  readonly name: string;
  readonly path: string;
  readonly files: ReadonlyArray<string>;
  readonly frontmatter: Option.Option<SkillFrontmatter>;
  readonly issues: ReadonlyArray<ActualSkillIssue>;
}

/**
 * Schema for ActualSkillV2.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ActualSkillV2Schema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  files: Schema.Array(Schema.String),
  frontmatter: Schema.OptionFromNullOr(SkillFrontmatterSchema),
  issues: Schema.Array(ActualSkillIssueSchema),
});

/**
 * Skill entry from lockfile (V2 - with Source and agents).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LockedSkillV2 {
  readonly name: string;
  readonly source: Source;
  readonly version: Option.Option<string>;
  readonly gitTreeHash: Option.Option<string>;
  readonly agents: ReadonlyArray<string>;
  readonly installedAt: Date;
  readonly updatedAt: Date;
}

/**
 * Schema for LockedSkillV2.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LockedSkillV2Schema = Schema.Struct({
  name: Schema.String,
  source: Schema.Unknown,
  version: Schema.OptionFromNullOr(Schema.String),
  gitTreeHash: Schema.OptionFromNullOr(Schema.String),
  agents: Schema.Array(Schema.String),
  installedAt: Schema.Date,
  updatedAt: Schema.Date,
});

/**
 * Combined state for a skill - actual + locked merged (V2 - with issues array).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillStateV2 {
  readonly name: string;
  readonly actual: Option.Option<ActualSkillV2>;
  readonly locked: Option.Option<LockedSkillV2>;
  readonly issues: ReadonlyArray<SkillStateIssue>;
}

/**
 * Schema for SkillStateV2.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillStateV2Schema = Schema.Struct({
  name: Schema.String,
  actual: Schema.OptionFromNullOr(ActualSkillV2Schema),
  locked: Schema.OptionFromNullOr(LockedSkillV2Schema),
  issues: Schema.Array(SkillStateIssueSchema),
});

/**
 * Current workspace state - all skills with their actual/locked status (V2).
 * Uses Array (not Record) to detect and report duplicate skill names on disk.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface CurrentState {
  readonly skills: ReadonlyArray<SkillStateV2>;
  readonly issues: ReadonlyArray<WorkspaceIssue>;
}

/**
 * Schema for CurrentState.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CurrentStateSchema = Schema.Struct({
  skills: Schema.Array(SkillStateV2Schema),
  issues: Schema.Array(WorkspaceIssueSchema),
});

// =============================================================================
// IdealSkill and IdealState (new reconciliation design)
// =============================================================================

/**
 * Desired skill after a command (V2 - with Source).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface IdealSkillV2 {
  readonly name: string;
  readonly source: Source;
  readonly version: Option.Option<string>;
  readonly gitTreeHash: Option.Option<string>;
  readonly agents: ReadonlyArray<string>;
}

/**
 * Constructor for IdealSkillV2.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const IdealSkillV2 = {
  make: (args: {
    name: string;
    source: Source;
    version: Option.Option<string>;
    gitTreeHash: Option.Option<string>;
    agents: ReadonlyArray<string>;
  }): IdealSkillV2 => args,
} as const;

/**
 * Alias for IdealSkillV2 constructor. Use IdealSkill.make() to create new IdealSkillV2 instances.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const IdealSkill = IdealSkillV2;

/**
 * Schema for IdealSkillV2.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const IdealSkillV2Schema = Schema.Struct({
  name: Schema.String,
  source: Schema.Unknown,
  version: Schema.OptionFromNullOr(Schema.String),
  gitTreeHash: Schema.OptionFromNullOr(Schema.String),
  agents: Schema.Array(Schema.String),
});

/**
 * Desired outcome - what we want after a command (V2).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface IdealState {
  readonly skills: ReadonlyArray<IdealSkillV2>;
}

/**
 * Schema for IdealState (V2).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const IdealStateV2Schema = Schema.Struct({
  skills: Schema.Array(IdealSkillV2Schema),
});

// =============================================================================
// Unified State (legacy)
// =============================================================================

/**
 * Complete state of a skill: actual + locked + computed validity.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillState {
  readonly name: string;
  readonly actual: Option.Option<ActualSkill>;
  readonly locked: Option.Option<LockedSkill>;
  readonly validity: SkillValidity;
}

/**
 * Schema for JSON serialization of SkillState.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillStateSchema = Schema.Struct({
  name: Schema.String,
  actual: Schema.OptionFromNullOr(ActualSkillSchema),
  locked: Schema.OptionFromNullOr(LockedSkillSchema),
  validity: SkillValiditySchema,
});

/**
 * Skills stored as Record for O(1) lookups and immutable updates.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillsState {
  readonly skills: Readonly<Record.ReadonlyRecord<string, SkillState>>;
}

/**
 * Schema for JSON serialization of SkillsState.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillsStateSchema = Schema.Struct({
  skills: Schema.Record({ key: Schema.String, value: SkillStateSchema }),
});

// =============================================================================
// Ideal State (desired after operation)
// =============================================================================

/**
 * Skill source types as discriminated union.
 * Use exhaustive switch for pattern matching.
 *
 * @experimental This API is unstable and may change without notice.
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
      readonly _tag: "Registry";
      readonly name: string;
      readonly version: string;
    };

/**
 * Constructors for SkillSource variants.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillSource = {
  Local: (args: { path: string }): SkillSource => ({ _tag: "Local", ...args }),
  Git: (args: {
    url: string;
    ref: Option.Option<string>;
    subpath: Option.Option<string>;
  }): SkillSource => ({ _tag: "Git", ...args }),
  Registry: (args: { name: string; version: string }): SkillSource => ({
    _tag: "Registry",
    ...args,
  }),
} as const;

/**
 * Schema for JSON serialization of SkillSource.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillSourceSchema = Schema.Union(
  Schema.TaggedStruct("Local", { path: Schema.String }),
  Schema.TaggedStruct("Git", {
    url: Schema.String,
    ref: Schema.OptionFromNullOr(Schema.String),
    subpath: Schema.OptionFromNullOr(Schema.String),
  }),
  Schema.TaggedStruct("Registry", {
    name: Schema.String,
    version: Schema.String,
  }),
);

/**
 * Desired state for a skill after an operation (legacy interface).
 *
 * The source field serves dual purpose:
 * 1. Where to fetch the skill from (for install/update)
 * 2. What to write to settings.json (the settings entry value)
 *
 * @deprecated Use IdealSkillV2 for the new reconciliation design.
 * @experimental This API is unstable and may change without notice.
 */
export interface IdealSkillLegacy {
  readonly name: string;
  readonly source: SkillSource;
  readonly gitTreeFolderHash: string;
  readonly description: Option.Option<string>;
  readonly agents: readonly string[];
}

/**
 * Type alias for legacy code that uses IdealSkill as a type.
 * Also provides IdealSkill.make() for creating V2 instances.
 *
 * @deprecated Use IdealSkillV2 for the new reconciliation design.
 * @experimental This API is unstable and may change without notice.
 */
export type IdealSkillType = IdealSkillLegacy;

/**
 * Schema for JSON serialization of IdealSkillLegacy.
 *
 * @deprecated Use IdealSkillSchema for the new reconciliation design.
 * @experimental This API is unstable and may change without notice.
 */
export const IdealSkillLegacySchema = Schema.Struct({
  name: Schema.String,
  source: SkillSourceSchema,
  gitTreeFolderHash: Schema.String,
  description: Schema.OptionFromNullOr(Schema.String),
  agents: Schema.Array(Schema.String),
});

/**
 * Ideal skills state with skills to add/update and removals list (legacy).
 *
 * @deprecated Use IdealState for the new reconciliation design.
 * @experimental This API is unstable and may change without notice.
 */
export interface IdealSkillsState {
  readonly skills: Readonly<Record.ReadonlyRecord<string, IdealSkillLegacy>>;
  readonly removals: readonly string[];
}

/**
 * Schema for JSON serialization of IdealSkillsState (legacy).
 *
 * @deprecated Use IdealStateSchema for the new reconciliation design.
 * @experimental This API is unstable and may change without notice.
 */
export const IdealSkillsStateSchema = Schema.Struct({
  skills: Schema.Record({ key: Schema.String, value: IdealSkillLegacySchema }),
  removals: Schema.Array(Schema.String),
});

// =============================================================================
// Diff / Plan
// =============================================================================

/**
 * Skill change types as discriminated union (legacy).
 * Use exhaustive switch for pattern matching.
 *
 * @deprecated Use PlanStep for the new reconciliation design.
 * @experimental This API is unstable and may change without notice.
 */
export type SkillChange =
  | { readonly _tag: "Add"; readonly skill: IdealSkillLegacy }
  | {
      readonly _tag: "Update";
      readonly from: SkillState;
      readonly to: IdealSkillLegacy;
    }
  | { readonly _tag: "Remove"; readonly skill: SkillState }
  | { readonly _tag: "Unchanged"; readonly skill: SkillState }
  | {
      readonly _tag: "Repair";
      readonly skill: SkillState;
      readonly target: IdealSkillLegacy;
    };

/**
 * Constructors for SkillChange variants (legacy).
 *
 * @deprecated Use PlanStep for the new reconciliation design.
 * @experimental This API is unstable and may change without notice.
 */
export const SkillChange = {
  Add: (args: { skill: IdealSkillLegacy }): SkillChange => ({ _tag: "Add", ...args }),
  Update: (args: { from: SkillState; to: IdealSkillLegacy }): SkillChange => ({
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
  Repair: (args: { skill: SkillState; target: IdealSkillLegacy }): SkillChange => ({
    _tag: "Repair",
    ...args,
  }),
} as const;

/**
 * Schema for JSON serialization of SkillChange (legacy).
 *
 * @deprecated Use PlanStepSchema for the new reconciliation design.
 * @experimental This API is unstable and may change without notice.
 */
export const SkillChangeSchema = Schema.Union(
  Schema.TaggedStruct("Add", { skill: IdealSkillLegacySchema }),
  Schema.TaggedStruct("Update", {
    from: SkillStateSchema,
    to: IdealSkillLegacySchema,
  }),
  Schema.TaggedStruct("Remove", { skill: SkillStateSchema }),
  Schema.TaggedStruct("Unchanged", { skill: SkillStateSchema }),
  Schema.TaggedStruct("Repair", {
    skill: SkillStateSchema,
    target: IdealSkillLegacySchema,
  }),
);

/**
 * Summary of diff counts by change type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface DiffSummary {
  readonly add: number;
  readonly update: number;
  readonly remove: number;
  readonly unchanged: number;
  readonly repair: number;
}

/**
 * Schema for JSON serialization of DiffSummary.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DiffSummarySchema = Schema.Struct({
  add: Schema.Number,
  update: Schema.Number,
  remove: Schema.Number,
  unchanged: Schema.Number,
  repair: Schema.Number,
});

/**
 * Diff/Plan for skills: changes and summary.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillsDiff {
  readonly changes: Readonly<Record.ReadonlyRecord<string, SkillChange>>;
  readonly summary: DiffSummary;
}

/**
 * Schema for JSON serialization of SkillsDiff.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillsDiffSchema = Schema.Struct({
  changes: Schema.Record({ key: Schema.String, value: SkillChangeSchema }),
  summary: DiffSummarySchema,
});

// =============================================================================
// JSON Output Types (for --json flag)
// =============================================================================

/**
 * Skill change with name field for array representation in JSON output.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillChangeWithName {
  readonly name: string;
  readonly _tag: SkillChange["_tag"];
  readonly skill: Option.Option<IdealSkillLegacy | SkillState>;
  readonly from: Option.Option<SkillState>;
  readonly to: Option.Option<IdealSkillLegacy>;
  readonly target: Option.Option<IdealSkillLegacy>;
}

/**
 * JSON output format for skills diff (array-based for CLI consumers).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillsDiffJson {
  readonly changes: readonly SkillChangeWithName[];
  readonly summary: DiffSummary;
}

/**
 * Convert internal SkillsDiff to JSON output format.
 * Transforms Record to array with name field for easier CLI consumption.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const skillsDiffToJson = (diff: SkillsDiff): SkillsDiffJson => ({
  changes: Object.entries(diff.changes).map(([name, change]): SkillChangeWithName => {
    switch (change._tag) {
      case "Add":
        return {
          name,
          _tag: change._tag,
          skill: Option.some(change.skill),
          from: Option.none(),
          to: Option.none(),
          target: Option.none(),
        };
      case "Update":
        return {
          name,
          _tag: change._tag,
          skill: Option.none(),
          from: Option.some(change.from),
          to: Option.some(change.to),
          target: Option.none(),
        };
      case "Remove":
        return {
          name,
          _tag: change._tag,
          skill: Option.some(change.skill),
          from: Option.none(),
          to: Option.none(),
          target: Option.none(),
        };
      case "Unchanged":
        return {
          name,
          _tag: change._tag,
          skill: Option.some(change.skill),
          from: Option.none(),
          to: Option.none(),
          target: Option.none(),
        };
      case "Repair":
        return {
          name,
          _tag: change._tag,
          skill: Option.some(change.skill),
          from: Option.none(),
          to: Option.none(),
          target: Option.some(change.target),
        };
    }
  }),
  summary: diff.summary,
});

// =============================================================================
// PlanStep, Plan, and ApplyResult (new reconciliation design)
// =============================================================================

/**
 * Plan step types as discriminated union.
 * Simplified from SkillChange: InstallSkill/UpdateSkill/UninstallSkill only.
 * Use exhaustive switch for pattern matching.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PlanStep =
  | {
      readonly _tag: "InstallSkill";
      readonly skill: string;
      readonly source: Source;
      readonly version: Option.Option<string>;
      readonly gitTreeHash: Option.Option<string>;
      readonly agents: ReadonlyArray<string>;
    }
  | {
      readonly _tag: "UpdateSkill";
      readonly skill: string;
      readonly source: Source;
      readonly fromVersion: Option.Option<string>;
      readonly toVersion: Option.Option<string>;
      readonly fromHash: Option.Option<string>;
      readonly toHash: Option.Option<string>;
      readonly agents: ReadonlyArray<string>;
    }
  | {
      readonly _tag: "UninstallSkill";
      readonly skill: string;
      readonly agents: ReadonlyArray<string>;
    };

/**
 * Constructors for PlanStep variants.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PlanStep = {
  InstallSkill: (args: {
    skill: string;
    source: Source;
    version: Option.Option<string>;
    gitTreeHash: Option.Option<string>;
    agents: ReadonlyArray<string>;
  }): PlanStep => ({ _tag: "InstallSkill", ...args }),

  UpdateSkill: (args: {
    skill: string;
    source: Source;
    fromVersion: Option.Option<string>;
    toVersion: Option.Option<string>;
    fromHash: Option.Option<string>;
    toHash: Option.Option<string>;
    agents: ReadonlyArray<string>;
  }): PlanStep => ({ _tag: "UpdateSkill", ...args }),

  UninstallSkill: (args: { skill: string; agents: ReadonlyArray<string> }): PlanStep => ({
    _tag: "UninstallSkill",
    ...args,
  }),
} as const;

/**
 * Schema for JSON serialization of PlanStep.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PlanStepSchema = Schema.Union(
  Schema.TaggedStruct("InstallSkill", {
    skill: Schema.String,
    source: Schema.Unknown,
    version: Schema.OptionFromNullOr(Schema.String),
    gitTreeHash: Schema.OptionFromNullOr(Schema.String),
    agents: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct("UpdateSkill", {
    skill: Schema.String,
    source: Schema.Unknown,
    fromVersion: Schema.OptionFromNullOr(Schema.String),
    toVersion: Schema.OptionFromNullOr(Schema.String),
    fromHash: Schema.OptionFromNullOr(Schema.String),
    toHash: Schema.OptionFromNullOr(Schema.String),
    agents: Schema.Array(Schema.String),
  }),
  Schema.TaggedStruct("UninstallSkill", {
    skill: Schema.String,
    agents: Schema.Array(Schema.String),
  }),
);

/**
 * Plan is pure data - no behavior.
 * Contains steps reflecting user intent for skill operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface Plan {
  readonly steps: ReadonlyArray<PlanStep>;
}

/**
 * Schema for JSON serialization of Plan.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PlanSchema = Schema.Struct({
  steps: Schema.Array(PlanStepSchema),
});

/**
 * Error type for apply operations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplyError {
  readonly _tag: "ApplyError";
  readonly message: string;
  readonly step: Option.Option<PlanStep>;
  readonly cause: Option.Option<unknown>;
}

/**
 * Schema for JSON serialization of ApplyError.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ApplyErrorSchema = Schema.TaggedStruct("ApplyError", {
  message: Schema.String,
  step: Schema.OptionFromNullOr(PlanStepSchema),
  cause: Schema.OptionFromNullOr(Schema.Unknown),
});

/**
 * Summary of apply operation counts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplySummary {
  readonly installed: number;
  readonly updated: number;
  readonly uninstalled: number;
  readonly failed: number;
}

/**
 * Schema for JSON serialization of ApplySummary.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ApplySummarySchema = Schema.Struct({
  installed: Schema.Number,
  updated: Schema.Number,
  uninstalled: Schema.Number,
  failed: Schema.Number,
});

/**
 * Result of applying a plan.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ApplyResult {
  readonly applied: ReadonlyArray<PlanStep>;
  readonly failed: ReadonlyArray<{ step: PlanStep; error: ApplyError }>;
  readonly summary: ApplySummary;
}

/**
 * Schema for JSON serialization of ApplyResult.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ApplyResultSchema = Schema.Struct({
  applied: Schema.Array(PlanStepSchema),
  failed: Schema.Array(
    Schema.Struct({
      step: PlanStepSchema,
      error: ApplyErrorSchema,
    }),
  ),
  summary: ApplySummarySchema,
});
