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
// Flat Source Schemas (discriminated by source field)
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
  source: Schema.Literal("github"),
  owner: Schema.String,
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
  source: Schema.Literal("git"),
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
  source: Schema.Literal("local"),
  path: Schema.String,
  ...CommonFields,
});

/**
 * Registry source - skill from a registry.
 * Required: scope, name
 * Optional: version
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistryLockEntrySchema = Schema.Struct({
  source: Schema.Literal("registry"),
  scope: Schema.String,
  name: Schema.String,
  version: Schema.optional(Schema.String),
  ...CommonFields,
});

// =============================================================================
// Skill Lock Entry (union of all source types)
// =============================================================================

/**
 * Lock entry for a single installed skill.
 * Discriminated union by the `source` field.
 *
 * Fields common to all entries:
 * - source: Source type ("github", "git", "local", "registry")
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
  GitLockEntrySchema,
  LocalLockEntrySchema,
  RegistryLockEntrySchema,
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
