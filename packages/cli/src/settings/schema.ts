/**
 * Schema definitions for AXM settings configuration.
 *
 * Settings define global configuration including sources, agents, and extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { AgentIdSchema } from "../extensions/common.js";

// -----------------------------------------------------------------------------
// Source Config (array-based, discriminated on `type` field)
// -----------------------------------------------------------------------------

/**
 * Pattern for source names: lowercase alphanumeric, hyphens, and dots.
 * Must start with a letter or digit.
 *
 * @experimental This API is unstable and may change without notice.
 */
const SOURCE_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

const SourceNameSchema = Schema.String.pipe(Schema.pattern(SOURCE_NAME_PATTERN));

/**
 * GitHub source configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const GitHubSourceConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("github"),
  url: Schema.URL,
});

/**
 * GitLab source configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const GitLabSourceConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("gitlab"),
  url: Schema.URL,
});

/**
 * Bitbucket source configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const BitbucketSourceConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("bitbucket"),
  url: Schema.URL,
});

/**
 * Azure Repos source configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const AzureReposSourceConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("azurerepos"),
  url: Schema.URL,
});

/**
 * Registry source configuration with optional scopes.
 *
 * @experimental This API is unstable and may change without notice.
 */
const RegistrySourceConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("registry"),
  url: Schema.URL,
  scopes: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Discriminated union of source configurations on the `type` field.
 *
 * Variants: github, gitlab, bitbucket, azurerepos, registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourceConfigSchema = Schema.Union(
  GitHubSourceConfigSchema,
  GitLabSourceConfigSchema,
  BitbucketSourceConfigSchema,
  AzureReposSourceConfigSchema,
  RegistrySourceConfigSchema,
);

/**
 * Inferred type for SourceConfig schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceConfig = typeof SourceConfigSchema.Type;

/** @experimental */
export type GitHubSourceConfig = typeof GitHubSourceConfigSchema.Type;
/** @experimental */
export type GitLabSourceConfig = typeof GitLabSourceConfigSchema.Type;
/** @experimental */
export type BitbucketSourceConfig = typeof BitbucketSourceConfigSchema.Type;
/** @experimental */
export type AzureReposSourceConfig = typeof AzureReposSourceConfigSchema.Type;
/** @experimental */

export type RegistrySourceConfig = typeof RegistrySourceConfigSchema.Type;
/**
 * Pattern for skill names per agentskills.io specification:
 * - Max 64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 *
 * @see https://agentskills.io/specification
 */
const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$|^[a-z0-9]$/;

/**
 * Shared validation callback for skill name keys per agentskills.io spec.
 * Used by both ExtensionMapSchema and SkillsMapSchema via Schema.filter.
 */
const validateSkillNameKeys = (record: { readonly [x: string]: unknown }) => {
  const invalidKeys = Object.keys(record).filter(
    (key) => key.length > 64 || !SKILL_NAME_PATTERN.test(key),
  );
  if (invalidKeys.length > 0) {
    return `Invalid skill name(s): ${invalidKeys.join(", ")}. Names must be max 64 chars, lowercase letters/numbers/hyphens, not starting or ending with hyphen.`;
  }
  return undefined;
};

/**
 * Extension map - maps skill names to version specifiers.
 *
 * Keys must be valid skill names per agentskills.io specification:
 * - Max 64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 *
 * Values are semver range strings (e.g., "^1.0.0", "~2.1.0", ">=1.0.0") or "*".
 *
 * @deprecated Use SkillsMapSchema for skills. This is kept for other extension types.
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionMapSchema = Schema.Record({
  key: Schema.String,
  value: Schema.String,
}).pipe(Schema.filter(validateSkillNameKeys));

/**
 * Inferred type for ExtensionMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionMap = typeof ExtensionMapSchema.Type;

/**
 * Managed skill with source and optional config flags.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillEntryObjectSchema = Schema.Struct({
  source: Schema.String,
  enabled: Schema.optional(Schema.Boolean),
});

/**
 * Unmanaged skill — just a marker, no source or enabled fields.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const UnmanagedSkillEntrySchema = Schema.Struct({
  managed: Schema.Literal(false),
});

/**
 * Union of skill entry forms: plain string, managed object, or unmanaged marker.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillEntrySchema = Schema.Union(
  Schema.String,
  SkillEntryObjectSchema,
  UnmanagedSkillEntrySchema,
);

/**
 * Inferred type for SkillEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillEntry = typeof SkillEntrySchema.Type;

/**
 * Skills map - maps skill names to skill entries.
 *
 * Keys must be valid skill names per agentskills.io specification:
 * - Max 64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 *
 * Values are skill entries: plain source strings, managed objects, or unmanaged markers.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillsMapSchema = Schema.Record({
  key: Schema.String,
  value: SkillEntrySchema,
}).pipe(Schema.filter(validateSkillNameKeys));

/**
 * Inferred type for SkillsMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillsMap = typeof SkillsMapSchema.Type;

// -----------------------------------------------------------------------------
// Pack Entry Schemas
// -----------------------------------------------------------------------------

/**
 * Managed pack with source.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackEntryObjectSchema = Schema.Struct({
  source: Schema.String,
});

/**
 * Union of pack entry forms: plain string or managed object.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackEntrySchema = Schema.Union(Schema.String, PackEntryObjectSchema);

/**
 * Inferred type for PackEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackEntry = typeof PackEntrySchema.Type;

/**
 * Packs map - maps pack names to pack entries.
 *
 * Keys must be valid extension names per agentskills.io specification:
 * - Max 64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 *
 * Values are pack entries: plain source strings or managed objects.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PacksMapSchema = Schema.Record({
  key: Schema.String,
  value: PackEntrySchema,
}).pipe(Schema.filter(validateSkillNameKeys));

/**
 * Inferred type for PacksMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PacksMap = typeof PacksMapSchema.Type;

/**
 * Canonical key order for settings properties.
 *
 * Used by `writeSettings` and `ensureTopLevelProperty` to ensure properties
 * appear in the same order as defined in `SettingsSchema`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SETTINGS_KEY_ORDER: ReadonlyArray<string> = [
  "scope",
  "sources",
  "agents",
  "skills",
  "commands",
  "packs",
  "mcp-servers",
];

/**
 * AXM settings configuration schema.
 *
 * Settings define global configuration for AXM including:
 * - scope: Default scope for resolving/publishing extensions
 * - sources: Source provider configurations
 * - agents: List of agent IDs to sync extensions to
 * - skills: Desired skills by name to source string
 * - commands: Desired commands by name to version specifier
 * - packs: Desired packs by name to version specifier
 * - mcp-servers: Desired MCP servers by name to version specifier
 *
 * @experimental This API is unstable and may change without notice.
 */
const ScopeSchema = Schema.transform(Schema.String, Schema.String, {
  strict: true,
  decode: (s) => (s.startsWith("@") ? s : `@${s}`),
  encode: (s) => s,
});

export const SettingsSchema = Schema.Struct({
  scope: Schema.optional(ScopeSchema),
  agents: Schema.optional(Schema.Array(AgentIdSchema)),
  sources: Schema.optional(Schema.Array(SourceConfigSchema)),
  commands: Schema.optional(ExtensionMapSchema),
  "mcp-servers": Schema.optional(ExtensionMapSchema),
  packs: Schema.optional(PacksMapSchema),
  skills: Schema.optional(SkillsMapSchema),
});

/**
 * Inferred type for Settings schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Settings = typeof SettingsSchema.Type;
