/**
 * State types for skills management - actual, locked, ideal, diff/plan.
 *
 * This module implements an Arborist-style state model where:
 * - **Actual** state is what exists on disk
 * - **Locked** state is what the lockfile says should exist
 * - **Ideal** state is the desired state after an operation
 * - **Diff/Plan** is the set of changes to transform actual to ideal
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { type Option, Schema } from "effect";

// =============================================================================
// Skill Frontmatter
// =============================================================================

/**
 * Skill frontmatter parsed from SKILL.md.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillFrontmatter {
  readonly name?: string;
  readonly description?: string;
  readonly version?: string;
  readonly triggers?: readonly string[];
}

/**
 * Schema for JSON serialization of SkillFrontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillFrontmatterSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  triggers: Schema.optional(Schema.Array(Schema.String)),
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
      return v.issues[0] ? getValidityCode(v.issues[0]) : null;
  }
};

// =============================================================================
// Unified State
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
  readonly skills: Readonly<Record<string, SkillState>>;
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
      readonly _tag: "WellKnown";
      readonly baseUrl: string;
      readonly skillName: string;
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
  WellKnown: (args: { baseUrl: string; skillName: string }): SkillSource => ({
    _tag: "WellKnown",
    ...args,
  }),
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
 * @experimental This API is unstable and may change without notice.
 */
export interface IdealSkill {
  readonly name: string;
  readonly source: SkillSource;
  readonly gitTreeFolderHash: string;
  readonly description: Option.Option<string>;
  readonly agents: readonly string[];
}

/**
 * Schema for JSON serialization of IdealSkill.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const IdealSkillSchema = Schema.Struct({
  name: Schema.String,
  source: SkillSourceSchema,
  gitTreeFolderHash: Schema.String,
  description: Schema.OptionFromNullOr(Schema.String),
  agents: Schema.Array(Schema.String),
});

/**
 * Ideal skills state with skills to add/update and removals list.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface IdealSkillsState {
  readonly skills: Readonly<Record<string, IdealSkill>>;
  readonly removals: readonly string[];
}

/**
 * Schema for JSON serialization of IdealSkillsState.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const IdealSkillsStateSchema = Schema.Struct({
  skills: Schema.Record({ key: Schema.String, value: IdealSkillSchema }),
  removals: Schema.Array(Schema.String),
});

// =============================================================================
// Diff / Plan
// =============================================================================

/**
 * Skill change types as discriminated union.
 * Use exhaustive switch for pattern matching.
 *
 * @experimental This API is unstable and may change without notice.
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

/**
 * Constructors for SkillChange variants.
 *
 * @experimental This API is unstable and may change without notice.
 */
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

/**
 * Schema for JSON serialization of SkillChange.
 *
 * @experimental This API is unstable and may change without notice.
 */
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
  readonly changes: Readonly<Record<string, SkillChange>>;
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
  readonly skill?: IdealSkill | SkillState;
  readonly from?: SkillState;
  readonly to?: IdealSkill;
  readonly target?: IdealSkill;
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
  // biome-ignore lint/suspicious/useIterableCallbackReturn: switch is exhaustive
  changes: Object.entries(diff.changes).map(([name, change]): SkillChangeWithName => {
    switch (change._tag) {
      case "Add":
        return { name, _tag: change._tag, skill: change.skill };
      case "Update":
        return { name, _tag: change._tag, from: change.from, to: change.to };
      case "Remove":
        return { name, _tag: change._tag, skill: change.skill };
      case "Unchanged":
        return { name, _tag: change._tag, skill: change.skill };
      case "Repair":
        return { name, _tag: change._tag, skill: change.skill, target: change.target };
    }
  }),
  summary: diff.summary,
});
