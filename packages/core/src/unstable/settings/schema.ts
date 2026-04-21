/**
 * Schema definitions for AXM settings configuration.
 *
 * Settings define workspace configuration including sources, agents, and extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { AgentIdSchema, ExtensionNameSchema } from "../extensions/common.js";
import { HandleSchema } from "../extensions/handle.js";
import { LintConfigSchema } from "../lint/config.js";

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

const SourceNameSchema = Schema.String.check(
  Schema.isPattern(SOURCE_NAME_PATTERN, {
    message:
      "source name must start with a letter or digit and contain only lowercase alphanumeric characters, hyphens, and dots",
  }),
).annotate({
  identifier: "SourceName",
  title: "Source Name",
  description:
    "A source name using lowercase letters, numbers, hyphens, and dots (e.g. github, my-registry.dev).",
  examples: ["github", "my-registry.dev"],
});

/**
 * GitHub source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const GitHubSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema.pipe(Schema.annotateKey({ messageMissingKey: "source name is required" })),
  type: Schema.Literal("github"),
  url: Schema.URLFromString.pipe(
    Schema.annotateKey({ messageMissingKey: "source url is required" }),
  ),
}).annotate({
  identifier: "GitHubSourceHostConfig",
  title: "GitHub Source Host",
  description: "Configuration for a GitHub source.",
});

/**
 * GitLab source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const GitLabSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema.pipe(Schema.annotateKey({ messageMissingKey: "source name is required" })),
  type: Schema.Literal("gitlab"),
  url: Schema.URLFromString.pipe(
    Schema.annotateKey({ messageMissingKey: "source url is required" }),
  ),
}).annotate({
  identifier: "GitLabSourceHostConfig",
  title: "GitLab Source Host",
  description: "Configuration for a GitLab source.",
});

/**
 * Bitbucket source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const BitbucketSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema.pipe(Schema.annotateKey({ messageMissingKey: "source name is required" })),
  type: Schema.Literal("bitbucket"),
  url: Schema.URLFromString.pipe(
    Schema.annotateKey({ messageMissingKey: "source url is required" }),
  ),
}).annotate({
  identifier: "BitbucketSourceHostConfig",
  title: "Bitbucket Source Host",
  description: "Configuration for a Bitbucket source.",
});

/**
 * Azure Repos source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const AzureReposSourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema.pipe(Schema.annotateKey({ messageMissingKey: "source name is required" })),
  type: Schema.Literal("azurerepos"),
  url: Schema.URLFromString.pipe(
    Schema.annotateKey({ messageMissingKey: "source url is required" }),
  ),
}).annotate({
  identifier: "AzureReposSourceHostConfig",
  title: "Azure Repos Source Host",
  description: "Configuration for an Azure Repos source.",
});

/**
 * Registry source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const RegistrySourceHostConfigSchema = Schema.Struct({
  name: SourceNameSchema.pipe(Schema.annotateKey({ messageMissingKey: "source name is required" })),
  type: Schema.Literal("registry"),
  location: Schema.URLFromString.pipe(
    Schema.annotateKey({ messageMissingKey: "source location is required" }),
  ),
}).annotate({
  identifier: "RegistrySourceHostConfig",
  title: "Registry Source Host",
  description: "Configuration for a package registry source.",
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
]).annotate({
  identifier: "SourceHostConfig",
  title: "Source Host Config",
  description:
    "Where extensions are fetched from — GitHub, GitLab, Bitbucket, Azure Repos, or a package registry.",
});

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
  source: Schema.String.pipe(Schema.annotateKey({ messageMissingKey: "skill source is required" })),
  enabled: Schema.optional(Schema.Boolean),
}).annotate({
  identifier: "SkillEntryObject",
  title: "Skill Entry Object",
  description: "A skill with its source location and whether it's enabled.",
});

/**
 * Union of skill entry forms: plain source string or object with source + enabled.
 *
 * Decodes to canonical `{ source, enabled }` form; encodes back to the most
 * compact JSON representation (plain string when enabled, object when disabled).
 *
 * The legacy unmanaged marker (`{ managed: false }`) is no longer supported.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillEntrySchema = Schema.Union([Schema.String, SkillEntryObjectSchema]).pipe(
  Schema.decodeTo(
    Schema.Struct({
      source: Schema.String,
      enabled: Schema.Boolean,
    }).annotate({
      identifier: "SkillEntry",
      title: "Skill Entry",
      description:
        "A skill reference — either a source string like @owner/skills/name or an object with source and enabled.",
    }),
    SchemaTransformation.transform({
      decode: (entry) =>
        typeof entry === "string"
          ? { source: entry, enabled: true }
          : { source: entry.source, enabled: entry.enabled ?? true },
      encode: (
        entry,
      ): string | { readonly source: string; readonly enabled?: boolean | undefined } =>
        entry.enabled ? entry.source : { source: entry.source, enabled: false },
    }),
  ),
);

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
export const SkillsMapSchema = Schema.Record(Schema.String, SkillEntrySchema)
  .check(Schema.makeFilter(validateNamedRecordKeys("skill", decodeExtensionNameSync)))
  .annotate({
    identifier: "SkillsMap",
    title: "Skills Map",
    description: "Your installed skills, keyed by name.",
  });

/**
 * Inferred type for SkillsMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillsMap = Schema.Schema.Type<typeof SkillsMapSchema>;

/**
 * Managed command with source and optional config flags.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandEntryObjectSchema = Schema.Struct({
  source: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "command source is required" }),
  ),
  enabled: Schema.optional(Schema.Boolean),
}).annotate({
  identifier: "CommandEntryObject",
  title: "Command Entry Object",
  description: "A command with its source location and whether it's enabled.",
});

/**
 * Union of command entry forms: plain source string or object with source + enabled.
 *
 * Decodes to canonical `{ source, enabled }` form; encodes back to the most
 * compact JSON representation (plain string when enabled, object when disabled).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandEntrySchema = Schema.Union([Schema.String, CommandEntryObjectSchema]).pipe(
  Schema.decodeTo(
    Schema.Struct({
      source: Schema.String,
      enabled: Schema.Boolean,
    }).annotate({
      identifier: "CommandEntry",
      title: "Command Entry",
      description:
        "A command reference — either a source string like @owner/commands/name or an object with source and enabled.",
    }),
    SchemaTransformation.transform({
      decode: (entry) =>
        typeof entry === "string"
          ? { source: entry, enabled: true }
          : { source: entry.source, enabled: entry.enabled ?? true },
      encode: (
        entry,
      ): string | { readonly source: string; readonly enabled?: boolean | undefined } =>
        entry.enabled ? entry.source : { source: entry.source, enabled: false },
    }),
  ),
);

/**
 * Inferred type for CommandEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandEntry = Schema.Schema.Type<typeof CommandEntrySchema>;

/**
 * Commands map - maps command names to command entries.
 *
 * Keys must be valid command names per extension naming conventions:
 * - Max 64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 *
 * Values are command entries: plain source strings or objects with source + enabled.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandsMapSchema = Schema.Record(Schema.String, CommandEntrySchema)
  .check(Schema.makeFilter(validateNamedRecordKeys("command", decodeExtensionNameSync)))
  .annotate({
    identifier: "CommandsMap",
    title: "Commands Map",
    description: "Your installed commands, keyed by name.",
  });

/**
 * Inferred type for CommandsMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandsMap = Schema.Schema.Type<typeof CommandsMapSchema>;

/**
 * MCP server entry object with source.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerEntryObjectSchema = Schema.Struct({
  source: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "MCP server source is required" }),
  ),
}).annotate({
  identifier: "McpServerEntryObject",
  title: "MCP Server Entry Object",
  description: "An MCP server with its source location.",
});

/**
 * Union of MCP server entry forms: plain source string or object with source.
 *
 * Decodes to canonical `{ source }` form; encodes back to the most compact
 * JSON representation (plain string).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerEntrySchema = Schema.Union([Schema.String, McpServerEntryObjectSchema]).pipe(
  Schema.decodeTo(
    Schema.Struct({
      source: Schema.String,
    }).annotate({
      identifier: "McpServerEntry",
      title: "MCP Server Entry",
      description: "An MCP server reference — either a source string or an object with source.",
    }),
    SchemaTransformation.transform({
      decode: (entry): { readonly source: string } =>
        typeof entry === "string" ? { source: entry } : { source: entry.source },
      encode: (entry): string | { readonly source: string } => entry.source,
    }),
  ),
);

/**
 * Inferred type for McpServerEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServerEntry = Schema.Schema.Type<typeof McpServerEntrySchema>;

/**
 * MCP servers map - maps MCP server names to MCP server entries.
 *
 * Keys use the canonical MCP server name schema from the shared kernel.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServersMapSchema = Schema.Record(Schema.String, McpServerEntrySchema)
  .check(Schema.makeFilter(validateNamedRecordKeys("MCP server", decodeExtensionNameSync)))
  .annotate({
    identifier: "McpServersMap",
    title: "MCP Servers Map",
    description: "Your installed MCP servers, keyed by name.",
  });

/**
 * Inferred type for McpServersMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServersMap = Schema.Schema.Type<typeof McpServersMapSchema>;

// -----------------------------------------------------------------------------
// Subagent Entry Schemas
// -----------------------------------------------------------------------------

/**
 * Managed subagent with source and optional config flags.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentEntryObjectSchema = Schema.Struct({
  source: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "subagent source is required" }),
  ),
  enabled: Schema.optional(Schema.Boolean),
}).annotate({
  identifier: "SubagentEntryObject",
  title: "Subagent Entry Object",
  description: "A subagent with its source location and whether it's enabled.",
});

/**
 * Union of subagent entry forms: plain source string or object with source + enabled.
 *
 * Decodes to canonical `{ source, enabled }` form; encodes back to the most
 * compact JSON representation (plain string when enabled, object when disabled).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentEntrySchema = Schema.Union([Schema.String, SubagentEntryObjectSchema]).pipe(
  Schema.decodeTo(
    Schema.Struct({
      source: Schema.String,
      enabled: Schema.Boolean,
    }).annotate({
      identifier: "SubagentEntry",
      title: "Subagent Entry",
      description:
        "A subagent reference — either a source string like @owner/subagents/name or an object with source and enabled.",
    }),
    SchemaTransformation.transform({
      decode: (entry) =>
        typeof entry === "string"
          ? { source: entry, enabled: true }
          : { source: entry.source, enabled: entry.enabled ?? true },
      encode: (
        entry,
      ): string | { readonly source: string; readonly enabled?: boolean | undefined } =>
        entry.enabled ? entry.source : { source: entry.source, enabled: false },
    }),
  ),
);

/**
 * Inferred type for SubagentEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentEntry = Schema.Schema.Type<typeof SubagentEntrySchema>;

/**
 * Subagents map - maps subagent names to subagent entries.
 *
 * Keys must be valid extension names per agentskills.io specification:
 * - Max 64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 *
 * Values are subagent entries: plain source strings or objects with source + enabled.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentsMapSchema = Schema.Record(Schema.String, SubagentEntrySchema)
  .check(Schema.makeFilter(validateNamedRecordKeys("subagent", decodeExtensionNameSync)))
  .annotate({
    identifier: "SubagentsMap",
    title: "Subagents Map",
    description: "Your installed subagents, keyed by name.",
  });

/**
 * Inferred type for SubagentsMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SubagentsMap = Schema.Schema.Type<typeof SubagentsMapSchema>;

// -----------------------------------------------------------------------------
// Pack Entry Schemas
// -----------------------------------------------------------------------------

/**
 * Pack entry object with source.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionPackEntryObjectSchema = Schema.Struct({
  source: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "extension pack source is required" }),
  ),
}).annotate({
  identifier: "ExtensionPackEntryObject",
  title: "Extension Pack Entry Object",
  description: "An extension pack with its source location.",
});

/**
 * Union of pack entry forms: plain source string or object with source.
 *
 * Decodes to canonical `{ source }` form; encodes back to the most compact
 * JSON representation (plain string).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ExtensionPackEntrySchema = Schema.Union([
  Schema.String,
  ExtensionPackEntryObjectSchema,
]).pipe(
  Schema.decodeTo(
    Schema.Struct({
      source: Schema.String,
    }).annotate({
      identifier: "ExtensionPackEntry",
      title: "Extension Pack Entry",
      description: "An extension pack reference — either a source string or an object with source.",
    }),
    SchemaTransformation.transform({
      decode: (entry): { readonly source: string } =>
        typeof entry === "string" ? { source: entry } : { source: entry.source },
      encode: (entry): string | { readonly source: string } => entry.source,
    }),
  ),
);

/**
 * Inferred type for ExtensionPackEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionPackEntry = Schema.Schema.Type<typeof ExtensionPackEntrySchema>;

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
export const ExtensionPacksMapSchema = Schema.Record(Schema.String, ExtensionPackEntrySchema)
  .check(Schema.makeFilter(validateNamedRecordKeys("extension pack", decodeExtensionNameSync)))
  .annotate({
    identifier: "ExtensionPacksMap",
    title: "Extension Packs Map",
    description: "Your installed extension packs, keyed by name.",
  });

/**
 * Inferred type for ExtensionPacksMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionPacksMap = Schema.Schema.Type<typeof ExtensionPacksMapSchema>;

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
  subagents: Schema.optional(Schema.Array(Schema.String)),
  mcpServers: Schema.optional(Schema.Array(Schema.String)),
  packs: Schema.optional(Schema.Array(Schema.String)),
}).annotate({
  identifier: "IgnoredSettings",
  title: "Ignored Settings",
  description: "Glob patterns for extensions to ignore, grouped by type (e.g. skills, commands).",
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
  "subagents",
  "packs",
  "mcpServers",
  "ignored",
  "lint",
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
  subagents: Schema.optional(SubagentsMapSchema),
  mcpServers: Schema.optional(McpServersMapSchema),
  packs: Schema.optional(ExtensionPacksMapSchema),
  skills: Schema.optional(SkillsMapSchema),
  ignored: Schema.optional(IgnoredSettingsSchema),
  lint: Schema.optional(LintConfigSchema),
}).annotate({
  identifier: "Settings",
  title: "AXM Settings",
  description:
    "Your workspace configuration — profile, sources, installed extensions, and ignore patterns.",
});

/**
 * Inferred type for Settings schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Settings = Schema.Schema.Type<typeof SettingsSchema>;
