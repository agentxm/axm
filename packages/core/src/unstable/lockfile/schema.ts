/**
 * Lockfile schema definition.
 *
 * The lockfile (axm-lock.yaml) records the exact resolved state of all installed
 * skills, enabling reproducible installations across environments.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import { FullyQualifiedNameSchema } from "../extensions/index.js";
import { ExactSemverVersionSchema } from "../version-constraints/index.js";

// =============================================================================
// Date Transform
// =============================================================================

/**
 * Schema that transforms ISO 8601 strings to Date objects.
 * Stored as string in YAML, decoded to Date in TypeScript.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DateFromString = Schema.String.pipe(
  Schema.decodeTo(Schema.DateValid, {
    decode: SchemaGetter.Date<string>(),
    encode: SchemaGetter.transform((date: Date) => date.toISOString()),
  }),
);

// =============================================================================
// Flat Source Schemas (discriminated by type field)
// =============================================================================

/**
 * Common fields shared by all lock entries (without agents).
 */
const BaseCommonFields = {
  installedAt: DateFromString,
  updatedAt: DateFromString,
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

// =============================================================================
// Source Lock Entry Factory
// =============================================================================

/**
 * Creates a Schema.Union of all 8 source-type lock entry structs,
 * parameterized by extra fields to spread into each variant.
 *
 * Used to produce SkillLockEntrySchema (with `agents`),
 * CommandLockEntrySchema and McpServerLockEntrySchema (without `agents`).
 */
const makeSourceLockUnion = <F extends Schema.Struct.Fields>(extraFields: F) =>
  Schema.Union([
    Schema.Struct({
      type: Schema.Literal("github"),
      owner: Schema.String,
      repo: Schema.String,
      ref: Schema.optional(Schema.String),
      path: Schema.optional(Schema.String),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("gitlab"),
      owner: Schema.String,
      repo: Schema.String,
      ref: Schema.optional(Schema.String),
      path: Schema.optional(Schema.String),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("bitbucket"),
      owner: Schema.String,
      repo: Schema.String,
      ref: Schema.optional(Schema.String),
      path: Schema.optional(Schema.String),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("azurerepos"),
      organization: Schema.String,
      project: Schema.String,
      repo: Schema.String,
      ref: Schema.optional(Schema.String),
      path: Schema.optional(Schema.String),
      ...extraFields,
    }),
    Schema.Struct({
      type: Schema.Literal("git"),
      url: Schema.String,
      ref: Schema.optional(Schema.String),
      path: Schema.optional(Schema.String),
      ...extraFields,
    }),
    Schema.Struct({ type: Schema.Literal("local"), path: Schema.String, ...extraFields }),
    Schema.Struct({
      type: Schema.Literal("registry"),
      profile: Schema.String,
      name: Schema.String,
      resolvedVersion: ExactSemverVersionSchema,
      integrity: Schema.String,
      sourceName: Schema.String,
      ...extraFields,
    }),
    Schema.Struct({ type: Schema.Literal("builtin"), ...extraFields }),
  ]);

// =============================================================================
// Skill Lock Entry (union of all source types, with agents)
// =============================================================================

/**
 * Lock entry for a single installed skill.
 * Discriminated union by the `type` field.
 *
 * Fields common to all entries:
 * - type: Source type ("github", "gitlab", "bitbucket", "azurerepos", "git", "local", "registry", "builtin")
 * - agents: Agent IDs this skill is installed for (can be empty)
 * - installedAt: ISO 8601 timestamp of initial installation (Date in TS)
 * - updatedAt: ISO 8601 timestamp of last update (Date in TS)
 * - gitTreeHash: Git tree SHA of source folder (git sources, optional)
 *
 * Source-specific fields are at the top level based on source type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillLockEntrySchema = makeSourceLockUnion(CommonFields);

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
// Command Lock Entry (union of all source types, no agents)
// =============================================================================

/**
 * Lock entry for a single installed command.
 * Discriminated union by the `type` field.
 *
 * Same structure as SkillLockEntry but without the `agents` field.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandLockEntrySchema = makeSourceLockUnion(BaseCommonFields);

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
export const ResolvedExtensionMapSchema = Schema.Record(
  FullyQualifiedNameSchema,
  ExactSemverVersionSchema,
);

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
  profile: Schema.String,
  name: Schema.String,
  resolvedVersion: ExactSemverVersionSchema,
  integrity: Schema.String,
  sourceName: Schema.String,
  installedAt: DateFromString,
  updatedAt: DateFromString,
  resolvedSkills: ResolvedExtensionMapSchema,
  resolvedCommands: ResolvedExtensionMapSchema,
  resolvedMcpServers: ResolvedExtensionMapSchema,
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
 * Builtin pack lock entry - pack bundled with axm.
 * No integrity or sourceName fields.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const BuiltinPackLockEntrySchema = Schema.Struct({
  type: Schema.Literal("builtin"),
  profile: Schema.String,
  name: Schema.String,
  resolvedVersion: ExactSemverVersionSchema,
  installedAt: DateFromString,
  updatedAt: DateFromString,
  resolvedSkills: ResolvedExtensionMapSchema,
  resolvedCommands: ResolvedExtensionMapSchema,
  resolvedMcpServers: ResolvedExtensionMapSchema,
});

/**
 * Inferred type for builtin pack lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type BuiltinPackLockEntry = Schema.Schema.Type<typeof BuiltinPackLockEntrySchema>;

/**
 * Constructor args for a builtin pack lock entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type BuiltinPackLockEntryArgs = Omit<BuiltinPackLockEntry, "type">;

/**
 * Build a builtin pack lock entry from typed args.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const makeBuiltinPackLockEntry = (args: BuiltinPackLockEntryArgs): BuiltinPackLockEntry => ({
  type: "builtin",
  ...args,
});

/**
 * Lock entry for a single installed pack.
 * Discriminated union by the `type` field.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackLockEntrySchema = Schema.Union([
  RegistryPackLockEntrySchema,
  BuiltinPackLockEntrySchema,
]);

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
  lockfileVersion: Schema.Number,
  skills: SkillsLockMapSchema,
  commands: Schema.optional(CommandsLockMapSchema),
  mcpServers: Schema.optional(McpServersLockMapSchema),
  packs: Schema.optional(PacksLockMapSchema),
});

/**
 * Inferred type for Lockfile schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Lockfile = Schema.Schema.Type<typeof LockfileSchema>;
