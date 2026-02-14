/**
 * Lockfile schema definition.
 *
 * The lockfile (axm-lock.yaml) records the exact resolved state of all installed
 * skills, enabling reproducible installations across environments.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

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
});

// =============================================================================
// Flat Source Schemas (discriminated by type field)
// =============================================================================

/**
 * Common fields shared by all lock entries.
 */
const CommonFields = {
  agents: Schema.Array(Schema.String),
  installedAt: DateFromString,
  updatedAt: DateFromString,
  gitTreeHash: Schema.optional(Schema.String),
};

/**
 * GitHub source - skill from a GitHub repository.
 * Required: owner, repo
 * Optional: ref, path
 *
 * @experimental This API is unstable and may change without notice.
 */
export const GitHubLockEntrySchema = Schema.Struct({
  type: Schema.Literal("github"),
  owner: Schema.String,
  repo: Schema.String,
  ref: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  ...CommonFields,
});

/**
 * GitLab source - skill from a GitLab repository.
 * Required: owner, repo
 * Optional: ref, path
 *
 * @experimental This API is unstable and may change without notice.
 */
export const GitLabLockEntrySchema = Schema.Struct({
  type: Schema.Literal("gitlab"),
  owner: Schema.String,
  repo: Schema.String,
  ref: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  ...CommonFields,
});

/**
 * Bitbucket source - skill from a Bitbucket repository.
 * Required: owner, repo
 * Optional: ref, path
 *
 * @experimental This API is unstable and may change without notice.
 */
export const BitbucketLockEntrySchema = Schema.Struct({
  type: Schema.Literal("bitbucket"),
  owner: Schema.String,
  repo: Schema.String,
  ref: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  ...CommonFields,
});

/**
 * Azure Repos source - skill from an Azure DevOps repository.
 * Required: organization, project, repo
 * Optional: ref, path
 *
 * @experimental This API is unstable and may change without notice.
 */
export const AzureReposLockEntrySchema = Schema.Struct({
  type: Schema.Literal("azurerepos"),
  organization: Schema.String,
  project: Schema.String,
  repo: Schema.String,
  ref: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  ...CommonFields,
});

/**
 * Git source - skill from a generic git repository.
 * Required: url
 * Optional: ref, path
 *
 * @experimental This API is unstable and may change without notice.
 */
export const GitLockEntrySchema = Schema.Struct({
  type: Schema.Literal("git"),
  url: Schema.String,
  ref: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  ...CommonFields,
});

/**
 * Local source - skill from a local filesystem path.
 * Required: path
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LocalLockEntrySchema = Schema.Struct({
  type: Schema.Literal("local"),
  path: Schema.String,
  ...CommonFields,
});

/**
 * Registry source - skill from a registry.
 * Required: scope, name, resolvedVersion, checksum, sourceName
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistryLockEntrySchema = Schema.Struct({
  type: Schema.Literal("registry"),
  scope: Schema.String,
  name: Schema.String,
  resolvedVersion: Schema.String,
  checksum: Schema.String,
  sourceName: Schema.String,
  ...CommonFields,
});

/**
 * Builtin source - skill bundled with axm.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const BuiltinSkillLockEntrySchema = Schema.Struct({
  type: Schema.Literal("builtin"),
  ...CommonFields,
});

// =============================================================================
// Skill Lock Entry (union of all source types)
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
export const SkillLockEntrySchema = Schema.Union(
  GitHubLockEntrySchema,
  GitLabLockEntrySchema,
  BitbucketLockEntrySchema,
  AzureReposLockEntrySchema,
  GitLockEntrySchema,
  LocalLockEntrySchema,
  RegistryLockEntrySchema,
  BuiltinSkillLockEntrySchema,
);

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
// Pack Lock Entry
// =============================================================================

/**
 * Resolved extension map: FQN keys to exact version strings.
 * Used for resolvedSkills, resolvedCommands, and resolvedMcpServers.
 */
export const ResolvedExtensionMapSchema = Schema.Record({
  key: Schema.String,
  value: Schema.String,
});

/**
 * Registry pack lock entry - pack from a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistryPackLockEntrySchema = Schema.Struct({
  type: Schema.Literal("registry"),
  scope: Schema.String,
  name: Schema.String,
  resolvedVersion: Schema.String,
  checksum: Schema.String,
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
 * No checksum or sourceName fields.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const BuiltinPackLockEntrySchema = Schema.Struct({
  type: Schema.Literal("builtin"),
  scope: Schema.String,
  name: Schema.String,
  resolvedVersion: Schema.String,
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
  packs: Schema.optional(PacksLockMapSchema),
});

/**
 * Inferred type for Lockfile schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Lockfile = typeof LockfileSchema.Type;
