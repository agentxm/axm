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
 * WellKnown source - skill from a well-known URL pattern.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const WellKnownSourceSchema = Schema.TaggedStruct("WellKnown", {
  baseUrl: Schema.String,
  skillName: Schema.String,
});

/**
 * Registry source - skill from a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RegistrySourceSchema = Schema.TaggedStruct("Registry", {
  name: Schema.String,
  version: Schema.String,
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
  WellKnownSourceSchema,
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
 * - source: Structured source object (Registry/GitHub/Git/Local/WellKnown)
 * - version: Semver version (registry sources only)
 * - gitTreeHash: Git tree SHA of source folder (git sources)
 * - agents: Agent IDs this skill is installed for (required, non-empty)
 * - installedAt: ISO 8601 timestamp of initial installation
 * - updatedAt: ISO 8601 timestamp of last update
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillLockEntrySchema = Schema.Struct({
  source: SkillSourceSchema,
  version: Schema.optional(Schema.String),
  gitTreeHash: Schema.optional(Schema.String),
  agents: Schema.NonEmptyArray(Schema.String),
  installedAt: Schema.String,
  updatedAt: Schema.String,
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

// =============================================================================
// Legacy Exports (kept for backward compatibility during migration)
// =============================================================================

/**
 * @deprecated Use SkillLockEntrySchema instead.
 * Legacy lock entry schema for backward compatibility.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LockEntrySchema = SkillLockEntrySchema;

/**
 * @deprecated Use SkillLockEntry instead.
 * Legacy type alias for backward compatibility.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LockEntry = SkillLockEntry;

/**
 * @deprecated Use SkillsLockMapSchema instead.
 * Legacy extension lock map schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionLockMapSchema = SkillsLockMapSchema;

/**
 * @deprecated Use SkillsLockMap instead.
 * Legacy type alias.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionLockMap = SkillsLockMap;

/**
 * @deprecated No longer used - skills are at root level now.
 * Legacy extensions by type schema (stub for backward compatibility).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionsByTypeSchema = Schema.Struct({
  skills: Schema.optional(SkillsLockMapSchema),
});

/**
 * @deprecated No longer used.
 * Legacy type alias.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionsByType = typeof ExtensionsByTypeSchema.Type;
