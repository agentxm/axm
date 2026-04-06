/**
 * Schema definitions for AXM settings configuration.
 *
 * Settings define workspace configuration including sources, agents, and extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { AgentIdSchema, ExtensionNameSchema } from "../extensions/common.js";
import { HandleSchema } from "../extensions/handle.js";

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
export type AzureReposSourceHostConfig = Schema.Schema.Type<
  typeof AzureReposSourceHostConfigSchema
>;
/** @experimental */
export type RegistrySourceHostConfig = Schema.Schema.Type<typeof RegistrySourceHostConfigSchema>;
const decodeExtensionNameSync = Schema.decodeUnknownSync(ExtensionNameSchema);

const validateNamedRecordKeys =
  (entryLabel: string, decodeName: (input: string) => unknown) =>
  (record: { readonly [x: string]: unknown }) => {
    const invalidKeys = Object.keys(record).filter((key) => {
      try {
        decodeName(key);
        return false;
      } catch {
        return true;
      }
    });

    return invalidKeys.length > 0
      ? `Invalid ${entryLabel} name(s): ${invalidKeys.join(", ")}. Names must be max 64 chars, lowercase letters/numbers/hyphens, not starting or ending with hyphen.`
      : undefined;
  };

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
export const SkillsMapSchema = Schema.Record(Schema.String, SkillEntrySchema).check(
  Schema.makeFilter(validateNamedRecordKeys("skill", decodeExtensionNameSync)),
);

/**
 * Inferred type for SkillsMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillsMap = Schema.Schema.Type<typeof SkillsMapSchema>;

/**
 * Commands map - maps command names to source strings.
 *
 * Keys use the canonical command name schema from the shared kernel.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandsMapSchema = Schema.Record(Schema.String, Schema.String).check(
  Schema.makeFilter(validateNamedRecordKeys("command", decodeExtensionNameSync)),
);

/**
 * Inferred type for CommandsMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandsMap = Schema.Schema.Type<typeof CommandsMapSchema>;

/**
 * MCP servers map - maps MCP server names to source strings.
 *
 * Keys use the canonical MCP server name schema from the shared kernel.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServersMapSchema = Schema.Record(Schema.String, Schema.String).check(
  Schema.makeFilter(validateNamedRecordKeys("MCP server", decodeExtensionNameSync)),
);

/**
 * Inferred type for McpServersMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServersMap = Schema.Schema.Type<typeof McpServersMapSchema>;

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
export const PacksMapSchema = Schema.Record(Schema.String, PackEntrySchema).check(
  Schema.makeFilter(validateNamedRecordKeys("pack", decodeExtensionNameSync)),
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
  "profile",
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
 * - profile: Default profile for resolving/publishing extensions
 * - sources: Source provider configurations
 * - agents: List of agent IDs to sync extensions to
 * - skills: Desired skills by name to source string
 * - commands: Desired commands by name to version specifier
 * - packs: Desired packs by name to version specifier
 * - mcp-servers: Desired MCP servers by name to version specifier
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SettingsSchema = Schema.Struct({
  telemetry: Schema.optional(Schema.Union([Schema.Boolean, Schema.Literal("errors")])),
  profile: Schema.optional(HandleSchema),
  agents: Schema.optional(Schema.Array(AgentIdSchema)),
  sources: Schema.optional(Schema.Array(SourceHostConfigSchema)),
  commands: Schema.optional(CommandsMapSchema),
  mcpServers: Schema.optional(McpServersMapSchema),
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
