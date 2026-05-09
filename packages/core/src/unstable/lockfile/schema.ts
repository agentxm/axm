/**
 * Lockfile schema definition.
 *
 * The lockfile (axm-lock.yaml) records the exact resolved state of all installed
 * skills, enabling reproducible installations across environments.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { DateFromIsoDateTimeStringSchema } from "../date-time.js";
import {
  ExtensionFqnSchema,
  HandleSchema,
  RenderedFilesMapSchema,
  SourceHashSchema,
} from "../extensions/index.js";
import { ExtensionNameSchema } from "../extensions/common.js";
import { VersionSchema } from "../version-constraints/version-constraints.js";
import { SourceRefSchema, SourceSegmentSchema, SourceSubPathSchema } from "../sources/types.js";

// =============================================================================
// Flat Source Schemas (discriminated by type field)
// =============================================================================

/**
 * Common fields shared by all lock entries (without agents).
 */
const BaseCommonFields = {
  installedAt: DateFromIsoDateTimeStringSchema,
  updatedAt: DateFromIsoDateTimeStringSchema,
  gitTreeHash: Schema.optional(Schema.String),
  retainedByPack: Schema.optional(Schema.Boolean),
};

/**
 * Common fields shared by skill lock entries (includes agents).
 */
const CommonFields = {
  agents: Schema.Array(Schema.String),
  ...BaseCommonFields,
};

/**
 * Common fields for skill lock entries (includes agents + rendered files).
 */
const SkillCommonFields = {
  ...CommonFields,
  sourceHash: Schema.optional(SourceHashSchema),
  renderedFiles: Schema.optional(RenderedFilesMapSchema),
};

// =============================================================================
// Source Lock Entry Factory
// =============================================================================

/**
 * Creates a Schema.Union of all 8 source-type lock entry structs,
 * parameterized by extra fields to spread into each variant.
 *
 * Used to produce SkillLockEntrySchema (with `agents`),
 * CommandLockEntrySchema (with `agents` + extra fields) and
 * McpServerLockEntrySchema (without `agents`).
 */
const makeSourceLockUnion = <F extends Schema.Struct.Fields>(extraFields: F) =>
  Schema.Union([
    Schema.Struct({
      type: Schema.Literal("github"),
      owner: SourceSegmentSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("gitlab"),
      owner: SourceSegmentSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("bitbucket"),
      owner: SourceSegmentSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("azurerepos"),
      organization: SourceSegmentSchema,
      project: SourceSegmentSchema,
      repo: SourceSegmentSchema,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("git"),
      url: Schema.String,
      ref: Schema.optional(SourceRefSchema),
      path: Schema.optional(SourceSubPathSchema),
      ...extraFields,
    }),
    Schema.Struct({ type: Schema.Literal("local"), path: Schema.String, ...extraFields }),
    Schema.Struct({
      type: Schema.Literal("registry"),
      owner: HandleSchema,
      name: ExtensionNameSchema,
      resolvedVersion: VersionSchema,
      integrity: Schema.String,
      sourceName: Schema.String,
      ...extraFields,
    }),
  ]);

// =============================================================================
// Skill Lock Entry (union of all source types, with agents)
// =============================================================================

/**
 * Lock entry for a single installed skill.
 * Discriminated union by the `type` field.
 *
 * Fields common to all entries:
 * - type: Source type ("github", "gitlab", "bitbucket", "azurerepos", "git", "local", "registry")
 * - agents: Agent IDs this skill is installed for (can be empty)
 * - installedAt: ISO 8601 timestamp of initial installation (Date in TS)
 * - updatedAt: ISO 8601 timestamp of last update (Date in TS)
 * - gitTreeHash: Git tree SHA of source folder (git sources, optional)
 * - sourceHash: SHA-256 hash of canonical skill source (copy-mode only, optional)
 * - renderedFiles: Map of agent ID to rendered file paths (copy-mode only, optional)
 *
 * Source-specific fields are at the top level based on source type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillLockEntrySchema = makeSourceLockUnion(SkillCommonFields);

/**
 * Inferred type for SkillLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillLockEntry = Schema.Schema.Type<typeof SkillLockEntrySchema>;

// =============================================================================
// Skills Lock Map
// =============================================================================

/**
 * Map of skill names to their lock entries.
 * Skill names are simple identifiers (not FQN patterns).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillsLockMapSchema = Schema.Record(Schema.String, SkillLockEntrySchema);

/**
 * Inferred type for SkillsLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillsLockMap = Schema.Schema.Type<typeof SkillsLockMapSchema>;

// =============================================================================
// Command Lock Entry (union of all source types, with agents)
// =============================================================================

/**
 * Common fields for command lock entries (includes agents + rendered files).
 */
const CommandCommonFields = {
  ...CommonFields,
  sourceHash: Schema.optional(Schema.String),
  renderedFiles: Schema.optional(RenderedFilesMapSchema),
};

/**
 * Lock entry for a single installed command.
 * Discriminated union by the `type` field.
 *
 * Includes `agents` array (like skills), plus `sourceHash` and `renderedFiles`
 * for tracking rendered output.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandLockEntrySchema = makeSourceLockUnion(CommandCommonFields);

/**
 * Inferred type for CommandLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandLockEntry = Schema.Schema.Type<typeof CommandLockEntrySchema>;

// =============================================================================
// Commands Lock Map
// =============================================================================

/**
 * Map of command names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandsLockMapSchema = Schema.Record(Schema.String, CommandLockEntrySchema);

/**
 * Inferred type for CommandsLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandsLockMap = Schema.Schema.Type<typeof CommandsLockMapSchema>;

// =============================================================================
// Subagent Lock Entry (union of all source types, with agents)
// =============================================================================

/**
 * Common fields for subagent lock entries (includes agents + rendered files).
 */
const SubagentLockEntryCommonFields = {
  ...CommonFields,
  sourceHash: Schema.optional(Schema.String),
  renderedFiles: Schema.optional(RenderedFilesMapSchema),
};

/**
 * Lock entry for a single installed subagent.
 * Discriminated union by the `type` field.
 *
 * Includes `agents` array (like skills), plus `sourceHash` and `renderedFiles`
 * for tracking rendered output.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentLockEntrySchema = makeSourceLockUnion(SubagentLockEntryCommonFields);

/**
 * Inferred type for SubagentLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentLockEntry = Schema.Schema.Type<typeof SubagentLockEntrySchema>;

// =============================================================================
// Subagents Lock Map
// =============================================================================

/**
 * Map of subagent names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentsLockMapSchema = Schema.Record(Schema.String, SubagentLockEntrySchema);

/**
 * Inferred type for SubagentsLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentsLockMap = Schema.Schema.Type<typeof SubagentsLockMapSchema>;

// =============================================================================
// MCP Server Lock Entry (union of all source types, no agents)
// =============================================================================

/**
 * Lock entry for a single installed MCP server.
 * Discriminated union by the `type` field.
 *
 * Same structure as SkillLockEntry but without the `agents` field.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerLockEntrySchema = makeSourceLockUnion(BaseCommonFields);

/**
 * Inferred type for McpServerLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServerLockEntry = Schema.Schema.Type<typeof McpServerLockEntrySchema>;

// =============================================================================
// MCP Servers Lock Map
// =============================================================================

/**
 * Map of MCP server names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServersLockMapSchema = Schema.Record(Schema.String, McpServerLockEntrySchema);

/**
 * Inferred type for McpServersLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServersLockMap = Schema.Schema.Type<typeof McpServersLockMapSchema>;

// =============================================================================
// Pack Lock Entry
// =============================================================================

/**
 * Resolved extension map: FQN keys to exact version strings.
 * Used for resolvedSkills, resolvedCommands, and resolvedMcpServers.
 */
export const ResolvedExtensionMapSchema = Schema.Record(ExtensionFqnSchema, VersionSchema);

/**
 * Inferred type for resolved extension maps.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ResolvedExtensionMap = Schema.Schema.Type<typeof ResolvedExtensionMapSchema>;

/**
 * Registry pack lock entry - pack from a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistryPackLockEntrySchema = Schema.Struct({
  type: Schema.Literal("registry"),
  owner: HandleSchema,
  name: ExtensionNameSchema,
  resolvedVersion: VersionSchema,
  integrity: Schema.String,
  sourceName: Schema.String,
  installedAt: DateFromIsoDateTimeStringSchema,
  updatedAt: DateFromIsoDateTimeStringSchema,
  resolvedSkills: ResolvedExtensionMapSchema,
  resolvedCommands: ResolvedExtensionMapSchema,
  resolvedMcpServers: ResolvedExtensionMapSchema,
  resolvedSubagents: ResolvedExtensionMapSchema,
}).annotate({
  identifier: "RegistryPackLockEntry",
  title: "Registry Pack Lock Entry",
  description: "Pinned version info for a pack installed from a registry.",
});

/**
 * Inferred type for RegistryPackLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RegistryPackLockEntry = Schema.Schema.Type<typeof RegistryPackLockEntrySchema>;

/**
 * Constructor args for a registry pack lock entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RegistryPackLockEntryArgs = Omit<RegistryPackLockEntry, "type">;

/**
 * Build a registry pack lock entry from typed args.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeRegistryPackLockEntry = (
  args: RegistryPackLockEntryArgs,
): RegistryPackLockEntry => ({
  type: "registry",
  ...args,
});

/**
 * Lock entry for a single installed pack.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackLockEntrySchema = RegistryPackLockEntrySchema.annotate({
  identifier: "PackLockEntry",
  title: "Pack Lock Entry",
  description: "Pinned version info for an installed pack from a registry.",
});

/**
 * Inferred type for PackLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackLockEntry = Schema.Schema.Type<typeof PackLockEntrySchema>;

// =============================================================================
// Packs Lock Map
// =============================================================================

/**
 * Map of pack names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PacksLockMapSchema = Schema.Record(Schema.String, PackLockEntrySchema);

/**
 * Inferred type for PacksLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PacksLockMap = Schema.Schema.Type<typeof PacksLockMapSchema>;

// =============================================================================
// Lockfile
// =============================================================================

/**
 * Schema for lockfile (axm-lock.yaml).
 *
 * The lockfile records the exact resolved state of all installed extensions,
 * enabling reproducible installations across environments.
 *
 * Structure:
 * - lockfileVersion: Schema version (currently 1)
 * - skills: Map of skill names to their lock entries
 * - packs: Map of pack names to their lock entries (optional)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LockfileSchema = Schema.Struct({
  lockfileVersion: Schema.Int.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(1)),
    Schema.annotate({
      description: "Lockfile schema version (currently 1).",
      default: 1,
    }),
    Schema.annotateKey({ messageMissingKey: "lockfileVersion is required" }),
  ),
  skills: SkillsLockMapSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "skills map is required" }),
  ),
  commands: Schema.optional(CommandsLockMapSchema),
  subagents: Schema.optional(SubagentsLockMapSchema),
  mcpServers: Schema.optional(McpServersLockMapSchema),
  packs: Schema.optional(PacksLockMapSchema),
}).annotate({
  identifier: "Lockfile",
  title: "AXM Lockfile",
  description:
    "Records the exact versions of all installed extensions so installs are reproducible.",
});

/**
 * Inferred type for Lockfile schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Lockfile = Schema.Schema.Type<typeof LockfileSchema>;
