/**
 * Lockfile schema definition.
 *
 * The lockfile (axm-lock.yaml) records the exact resolved state of all installed
 * skills, enabling reproducible installations across environments.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Schema } from "effect";

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
// Registry Location (discriminated union)
// =============================================================================

/**
 * Remote registry location - registry at a URL.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RemoteLocationSchema = Schema.TaggedStruct("Remote", {
  url: Schema.String,
});

/**
 * FileSystem registry location - registry at a local path.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileSystemLocationSchema = Schema.TaggedStruct("FileSystem", {
  path: Schema.String,
});

/**
 * Registry location discriminated union.
 * Represents where a registry is located.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistryLocationSchema = Schema.Union(RemoteLocationSchema, FileSystemLocationSchema);

/**
 * Inferred type for RegistryLocation schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RegistryLocation = typeof RegistryLocationSchema.Type;

// =============================================================================
// Skill Source (discriminated union for source types)
// =============================================================================

/**
 * Local source - skill from a local filesystem path.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LocalSourceSchema = Schema.TaggedStruct("Local", {
  path: Schema.String,
});

/**
 * Git source - skill from a git repository.
 *
 * Note: Uses Git (_tag: "Git") to align with state/types.ts SkillSource.
 * The lockfile stores resolved ref/subpath as optional strings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const GitSourceSchema = Schema.TaggedStruct("Git", {
  url: Schema.String,
  ref: Schema.optional(Schema.String),
  subpath: Schema.optional(Schema.String),
});

/**
 * GitHub source - skill from a GitHub repository (shorthand for Git).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const GitHubSourceSchema = Schema.TaggedStruct("GitHub", {
  owner: Schema.String,
  repo: Schema.String,
  ref: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
});

/**
 * Registry source - skill from a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistrySourceSchema = Schema.TaggedStruct("Registry", {
  location: RegistryLocationSchema,
  scope: Schema.String,
  name: Schema.String,
  version: Schema.optional(Schema.String),
});

/**
 * Skill source discriminated union.
 * Represents where a skill was installed from.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillSourceSchema = Schema.Union(
  LocalSourceSchema,
  GitSourceSchema,
  GitHubSourceSchema,
  RegistrySourceSchema,
);

/**
 * Inferred type for SkillSource schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillSource = typeof SkillSourceSchema.Type;

// =============================================================================
// Skill Lock Entry
// =============================================================================

/**
 * Lock entry for a single installed skill.
 *
 * Fields:
 * - name: Skill identifier (also the map key, stored redundantly for convenience)
 * - source: Structured source object (Registry/GitHub/Git/Local)
 * - version: Semver version (registry sources only)
 * - gitTreeHash: Git tree SHA of source folder (git sources)
 * - agents: Agent IDs this skill is installed for (can be empty)
 * - installedAt: ISO 8601 timestamp of initial installation (Date in TS)
 * - updatedAt: ISO 8601 timestamp of last update (Date in TS)
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillLockEntrySchema = Schema.Struct({
  name: Schema.String,
  source: SkillSourceSchema,
  version: Schema.optional(Schema.String),
  gitTreeHash: Schema.optional(Schema.String),
  agents: Schema.Array(Schema.String),
  installedAt: DateFromString,
  updatedAt: DateFromString,
});

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
// Lockfile
// =============================================================================

/**
 * Schema for lockfile (axm-lock.yaml).
 *
 * The lockfile records the exact resolved state of all installed skills,
 * enabling reproducible installations across environments.
 *
 * Structure:
 * - lockfileVersion: Schema version (currently 1)
 * - skills: Map of skill names to their lock entries
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LockfileSchema = Schema.Struct({
  lockfileVersion: Schema.Number,
  skills: SkillsLockMapSchema,
});

/**
 * Inferred type for Lockfile schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Lockfile = typeof LockfileSchema.Type;
