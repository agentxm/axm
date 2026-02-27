/**
 * Lockfile schema definition.
 *
 * The lockfile (axm-lock.yaml) records the exact resolved state of all installed
 * skills, enabling reproducible installations across environments.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as semver from "semver";

// =============================================================================
// Date Transform
// =============================================================================

/**
 * Schema that transforms ISO 8601 strings to Date objects.
 * Stored as string in YAML, decoded to Date in TypeScript.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DateFromString = Schema.transform(Schema.String, Schema.DateFromSelf, {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
}).pipe(Schema.filter((d) => (isNaN(d.getTime()) ? "Invalid date string" : undefined)));

/**
 * Exact semver version (no ranges).
 */
export const ExactSemverVersionSchema = Schema.String.pipe(
  Schema.filter((value) => {
    const normalized = semver.valid(value);
    return normalized === value ? undefined : `Expected exact semver version, got: ${value}`;
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
  Schema.Union(
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
      namespace: Schema.String,
      name: Schema.String,
      resolvedVersion: ExactSemverVersionSchema,
      integrity: Schema.String,
      sourceName: Schema.String,
      ...extraFields,
    }),
    Schema.Struct({ type: Schema.Literal("builtin"), ...extraFields }),
  );

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
export type SkillLockEntry = typeof SkillLockEntrySchema.Type;

// =============================================================================
// Skills Lock Map
// =============================================================================

/**
 * Map of skill names to their lock entries.
 * Skill names are simple identifiers (not FQN patterns).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillsLockMapSchema = Schema.Record({
  key: Schema.String,
  value: SkillLockEntrySchema,
});

/**
 * Inferred type for SkillsLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillsLockMap = typeof SkillsLockMapSchema.Type;

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
export type CommandLockEntry = typeof CommandLockEntrySchema.Type;

// =============================================================================
// Commands Lock Map
// =============================================================================

/**
 * Map of command names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandsLockMapSchema = Schema.Record({
  key: Schema.String,
  value: CommandLockEntrySchema,
});

/**
 * Inferred type for CommandsLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandsLockMap = typeof CommandsLockMapSchema.Type;

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
export type McpServerLockEntry = typeof McpServerLockEntrySchema.Type;

// =============================================================================
// MCP Servers Lock Map
// =============================================================================

/**
 * Map of MCP server names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServersLockMapSchema = Schema.Record({
  key: Schema.String,
  value: McpServerLockEntrySchema,
});

/**
 * Inferred type for McpServersLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServersLockMap = typeof McpServersLockMapSchema.Type;

// =============================================================================
// Pack Lock Entry
// =============================================================================

/**
 * Resolved extension map: FQN keys to exact version strings.
 * Used for resolvedSkills, resolvedCommands, and resolvedMcpServers.
 */
export const ResolvedExtensionMapSchema = Schema.Record({
  key: Schema.String,
  value: ExactSemverVersionSchema,
});

/**
 * Registry pack lock entry - pack from a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistryPackLockEntrySchema = Schema.Struct({
  type: Schema.Literal("registry"),
  namespace: Schema.String,
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
export type RegistryPackLockEntry = typeof RegistryPackLockEntrySchema.Type;

/**
 * Builtin pack lock entry - pack bundled with axm.
 * No integrity or sourceName fields.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const BuiltinPackLockEntrySchema = Schema.Struct({
  type: Schema.Literal("builtin"),
  namespace: Schema.String,
  name: Schema.String,
  resolvedVersion: ExactSemverVersionSchema,
  installedAt: DateFromString,
  updatedAt: DateFromString,
  resolvedSkills: ResolvedExtensionMapSchema,
  resolvedCommands: ResolvedExtensionMapSchema,
  resolvedMcpServers: ResolvedExtensionMapSchema,
});

/**
 * Lock entry for a single installed pack.
 * Discriminated union by the `type` field.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackLockEntrySchema = Schema.Union(
  RegistryPackLockEntrySchema,
  BuiltinPackLockEntrySchema,
);

/**
 * Inferred type for PackLockEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackLockEntry = typeof PackLockEntrySchema.Type;

// =============================================================================
// Packs Lock Map
// =============================================================================

/**
 * Map of pack names to their lock entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PacksLockMapSchema = Schema.Record({
  key: Schema.String,
  value: PackLockEntrySchema,
});

/**
 * Inferred type for PacksLockMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PacksLockMap = typeof PacksLockMapSchema.Type;

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
export type Lockfile = typeof LockfileSchema.Type;
