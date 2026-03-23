/**
 * Schema definitions for AXM settings configuration.
 *
 * Settings define workspace configuration including sources, agents, and extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import { AgentIdSchema } from "../extensions/common.js";

// -----------------------------------------------------------------------------
// Source Host Config (array-based, discriminated on `type` field)
// -----------------------------------------------------------------------------

/**
 * Pattern for source names: lowercase alphanumeric, hyphens, and dots.
 * Must start with a letter or digit.
 *
 * @experimental This API is unstable and may change without notice.
 */
const SOURCE_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

const SourceNameSchema = Schema.String.check(Schema.isPattern(SOURCE_NAME_PATTERN));

/**
 * GitHub source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const GitHubSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("github"),
  url: Schema.URLFromString,
});

/**
 * GitLab source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const GitLabSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("gitlab"),
  url: Schema.URLFromString,
});

/**
 * Bitbucket source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const BitbucketSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("bitbucket"),
  url: Schema.URLFromString,
});

/**
 * Azure Repos source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const AzureReposSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("azurerepos"),
  url: Schema.URLFromString,
});

/**
 * Registry source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const RegistrySourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema,
  type: Schema.Literal("registry"),
  location: Schema.URLFromString,
});

/**
 * Discriminated union of source host configurations on the `type` field.
 *
 * Variants: github, gitlab, bitbucket, azurerepos, registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourceHostConfigSchema = Schema.Union([
  GitHubSourceHostConfigSchema,
  GitLabSourceHostConfigSchema,
  BitbucketSourceHostConfigSchema,
  AzureReposSourceHostConfigSchema,
  RegistrySourceHostConfigSchema,
]);

/**
 * Inferred type for SourceHostConfig schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceHostConfig = Schema.Schema.Type<typeof SourceHostConfigSchema>;

/** @experimental */
export type GitHubSourceHostConfig = Schema.Schema.Type<typeof GitHubSourceHostConfigSchema>;
/** @experimental */
export type GitLabSourceHostConfig = Schema.Schema.Type<typeof GitLabSourceHostConfigSchema>;
/** @experimental */
export type BitbucketSourceHostConfig = Schema.Schema.Type<typeof BitbucketSourceHostConfigSchema>;
/** @experimental */
export type AzureReposSourceHostConfig = Schema.Schema.Type<typeof AzureReposSourceHostConfigSchema>;
/** @experimental */
export type RegistrySourceHostConfig = Schema.Schema.Type<typeof RegistrySourceHostConfigSchema>;
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
 * Used by both NonSkillExtensionsMapSchema and SkillsMapSchema via Schema.filter.
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
 * @experimental This API is unstable and may change without notice.
 */
export const NonSkillExtensionsMapSchema = Schema.Record(Schema.String, Schema.String).pipe(
  Schema.check(Schema.makeFilter(validateSkillNameKeys)),
);

/**
 * Inferred type for NonSkillExtensionsMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type NonSkillExtensionsMap = Schema.Schema.Type<typeof NonSkillExtensionsMapSchema>;

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
 * Union of skill entry forms: plain source string or object with source + enabled.
 *
 * The legacy unmanaged marker (`{ managed: false }`) is no longer supported.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillEntrySchema = Schema.Union([Schema.String, SkillEntryObjectSchema]);

/**
 * Inferred type for SkillEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillEntry = Schema.Schema.Type<typeof SkillEntrySchema>;

/**
 * Skills map - maps skill names to skill entries.
 *
 * Keys must be valid skill names per agentskills.io specification:
 * - Max 64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 *
 * Values are skill entries: plain source strings or objects with source + enabled.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillsMapSchema = Schema.Record(Schema.String, SkillEntrySchema).pipe(
  Schema.check(Schema.makeFilter(validateSkillNameKeys)),
);

/**
 * Inferred type for SkillsMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillsMap = Schema.Schema.Type<typeof SkillsMapSchema>;

// -----------------------------------------------------------------------------
// Pack Entry Schemas
// -----------------------------------------------------------------------------

/**
 * Pack entry object with source.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackEntryObjectSchema = Schema.Struct({
  source: Schema.String,
});

/**
 * Union of pack entry forms: plain source string or object with source.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackEntrySchema = Schema.Union([Schema.String, PackEntryObjectSchema]);

/**
 * Inferred type for PackEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PackEntry = Schema.Schema.Type<typeof PackEntrySchema>;

/**
 * Packs map - maps pack names to pack entries.
 *
 * Keys must be valid extension names per agentskills.io specification:
 * - Max 64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 *
 * Values are pack entries: plain source strings or objects with source.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PacksMapSchema = Schema.Record(Schema.String, PackEntrySchema).pipe(
  Schema.check(Schema.makeFilter(validateSkillNameKeys)),
);

/**
 * Inferred type for PacksMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PacksMap = Schema.Schema.Type<typeof PacksMapSchema>;

// -----------------------------------------------------------------------------
// Ignored Patterns Schema
// -----------------------------------------------------------------------------

/**
 * Ignored patterns map — per-extension-type arrays of glob patterns
 * for extensions to exclude from lifecycle classification.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const IgnoredSettingsSchema = Schema.Struct({
  skills: Schema.optional(Schema.Array(Schema.String)),
  commands: Schema.optional(Schema.Array(Schema.String)),
  mcpServers: Schema.optional(Schema.Array(Schema.String)),
  packs: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Inferred type for IgnoredSettings schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type IgnoredSettings = Schema.Schema.Type<typeof IgnoredSettingsSchema>;

/**
 * Canonical key order for settings properties.
 *
 * Used by `writeSettings` to ensure properties
 * appear in the same order as defined in `SettingsSchema`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SETTINGS_KEY_ORDER: ReadonlyArray<string> = [
  "telemetry",
  "namespace",
  "sources",
  "agents",
  "skills",
  "commands",
  "packs",
  "mcpServers",
  "ignored",
];

/**
 * AXM settings configuration schema.
 *
 * Settings define workspace configuration for AXM including:
 * - namespace: Default namespace for resolving/publishing extensions
 * - sources: Source provider configurations
 * - agents: List of agent IDs to sync extensions to
 * - skills: Desired skills by name to source string
 * - commands: Desired commands by name to version specifier
 * - packs: Desired packs by name to version specifier
 * - mcp-servers: Desired MCP servers by name to version specifier
 *
 * @experimental This API is unstable and may change without notice.
 */
const NamespaceSchema = Schema.String.pipe(
  Schema.decode({
    decode: SchemaGetter.transform((s: string) => (s.startsWith("@") ? s : `@${s}`)),
    encode: SchemaGetter.transform((s: string) => s),
  }),
);

export const SettingsSchema = Schema.Struct({
  telemetry: Schema.optional(Schema.Union([Schema.Boolean, Schema.Literal("errors")])),
  namespace: Schema.optional(NamespaceSchema),
  agents: Schema.optional(Schema.Array(AgentIdSchema)),
  sources: Schema.optional(Schema.Array(SourceHostConfigSchema)),
  commands: Schema.optional(NonSkillExtensionsMapSchema),
  mcpServers: Schema.optional(NonSkillExtensionsMapSchema),
  packs: Schema.optional(PacksMapSchema),
  skills: Schema.optional(SkillsMapSchema),
  ignored: Schema.optional(IgnoredSettingsSchema),
});

/**
 * Inferred type for Settings schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Settings = Schema.Schema.Type<typeof SettingsSchema>;
