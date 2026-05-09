/**
 * Schema definitions for AXM settings configuration.
 *
 * Settings define workspace configuration including sources, agents, and extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { AgentIdSchema, EXTENSION_NAME_PATTERN } from "../extensions/common.js";
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

type AuthoredEntryObject = {
  readonly source: string;
  readonly authored?: boolean | undefined;
};

type AuthoredEntry = {
  readonly source: string;
  readonly authored: boolean;
};

type EnabledEntryObject = AuthoredEntryObject & {
  readonly enabled?: boolean | undefined;
};

type EnabledEntry = AuthoredEntry & {
  readonly enabled: boolean;
};

const ExtensionMapKeySchema = Schema.String.check(
  Schema.isPattern(EXTENSION_NAME_PATTERN, {
    message:
      "Names must be max 64 chars, lowercase letters/numbers/hyphens, not starting or ending with hyphen.",
  }),
);

const authoredFieldSchema = Schema.optional(
  Schema.Boolean.annotate({
    description: "Whether this entry was authored locally. Defaults to false when omitted.",
    default: false,
  }),
);

const enabledFieldSchema = Schema.optional(
  Schema.Boolean.annotate({
    description: "Whether this entry is enabled. Defaults to true when omitted.",
    default: true,
  }),
);

const compactOrVerboseEntry = <
  ObjectEntry extends AuthoredEntryObject,
  CanonicalEntry extends AuthoredEntry,
  ObjectSchema extends Schema.Codec<ObjectEntry, ObjectEntry>,
  CanonicalSchema extends Schema.Codec<CanonicalEntry, CanonicalEntry>,
>(
  objectSchema: ObjectSchema,
  canonicalSchema: CanonicalSchema,
  transformation: {
    readonly decode: (entry: string | ObjectEntry) => CanonicalEntry;
    readonly encode: (entry: CanonicalEntry) => string | ObjectEntry;
  },
) =>
  Schema.Union([Schema.String, objectSchema]).pipe(
    Schema.decodeTo(
      canonicalSchema,
      SchemaTransformation.transform<CanonicalEntry, string | ObjectEntry>(transformation),
    ),
  );

/**
 * Managed skill with source and optional config flags.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillEntryObjectSchema = Schema.Struct({
  source: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "skill source is required" }),
  ),
  enabled: enabledFieldSchema,
  authored: authoredFieldSchema,
}).annotate({
  identifier: "SkillEntryObject",
  title: "Skill Entry Object",
  description: "A skill with its source location and whether it's enabled.",
});

/**
 * Union of skill entry forms: plain source string or object with source + enabled + authored.
 *
 * Decodes to canonical `{ source, enabled, authored }` form; encodes back to
 * the most compact JSON representation (plain string when enabled and not
 * authored, object otherwise).
 *
 * The legacy unmanaged marker (`{ managed: false }`) is no longer supported.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillEntrySchema = compactOrVerboseEntry(
  SkillEntryObjectSchema,
  Schema.Struct({
    source: Schema.String,
    enabled: Schema.Boolean,
    authored: Schema.Boolean,
  }).annotate({
    identifier: "SkillEntry",
    title: "Skill Entry",
    description:
      "A skill reference — either a source string like @owner/skills/name or an object with source, enabled, and authored.",
  }),
  {
    decode: (entry: string | EnabledEntryObject): EnabledEntry =>
      typeof entry === "string"
        ? { source: entry, enabled: true, authored: false }
        : {
            source: entry.source,
            enabled: entry.enabled ?? true,
            authored: entry.authored ?? false,
          },
    encode: (entry: EnabledEntry): string | EnabledEntryObject => {
      if (entry.enabled && !entry.authored) return entry.source;
      const obj: { source: string; enabled?: boolean; authored?: boolean } = {
        source: entry.source,
      };
      if (!entry.enabled) obj.enabled = false;
      if (entry.authored) obj.authored = true;
      return obj;
    },
  },
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
export const SkillsMapSchema = Schema.Record(ExtensionMapKeySchema, SkillEntrySchema).annotate({
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
  source: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "command source is required" }),
  ),
  enabled: enabledFieldSchema,
  authored: authoredFieldSchema,
}).annotate({
  identifier: "CommandEntryObject",
  title: "Command Entry Object",
  description: "A command with its source location and whether it's enabled.",
});

/**
 * Union of command entry forms: plain source string or object with source + enabled + authored.
 *
 * Decodes to canonical `{ source, enabled, authored }` form; encodes back to
 * the most compact JSON representation (plain string when enabled and not
 * authored, object otherwise).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandEntrySchema = compactOrVerboseEntry(
  CommandEntryObjectSchema,
  Schema.Struct({
    source: Schema.String,
    enabled: Schema.Boolean,
    authored: Schema.Boolean,
  }).annotate({
    identifier: "CommandEntry",
    title: "Command Entry",
    description:
      "A command reference — either a source string like @owner/commands/name or an object with source, enabled, and authored.",
  }),
  {
    decode: (entry: string | EnabledEntryObject): EnabledEntry =>
      typeof entry === "string"
        ? { source: entry, enabled: true, authored: false }
        : {
            source: entry.source,
            enabled: entry.enabled ?? true,
            authored: entry.authored ?? false,
          },
    encode: (entry: EnabledEntry): string | EnabledEntryObject => {
      if (entry.enabled && !entry.authored) return entry.source;
      const obj: { source: string; enabled?: boolean; authored?: boolean } = {
        source: entry.source,
      };
      if (!entry.enabled) obj.enabled = false;
      if (entry.authored) obj.authored = true;
      return obj;
    },
  },
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
export const CommandsMapSchema = Schema.Record(ExtensionMapKeySchema, CommandEntrySchema).annotate({
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
  source: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "MCP server source is required" }),
  ),
  authored: authoredFieldSchema,
}).annotate({
  identifier: "McpServerEntryObject",
  title: "MCP Server Entry Object",
  description: "An MCP server with its source location.",
});

/**
 * Union of MCP server entry forms: plain source string or object with source + authored.
 *
 * Decodes to canonical `{ source, authored }` form; encodes back to the most
 * compact JSON representation (plain string when not authored, object otherwise).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerEntrySchema = compactOrVerboseEntry(
  McpServerEntryObjectSchema,
  Schema.Struct({
    source: Schema.String,
    authored: Schema.Boolean,
  }).annotate({
    identifier: "McpServerEntry",
    title: "MCP Server Entry",
    description:
      "An MCP server reference — either a source string or an object with source and authored.",
  }),
  {
    decode: (entry: string | AuthoredEntryObject): AuthoredEntry =>
      typeof entry === "string"
        ? { source: entry, authored: false }
        : { source: entry.source, authored: entry.authored ?? false },
    encode: (entry: AuthoredEntry): string | AuthoredEntryObject =>
      entry.authored ? { source: entry.source, authored: true } : entry.source,
  },
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
export const McpServersMapSchema = Schema.Record(
  ExtensionMapKeySchema,
  McpServerEntrySchema,
).annotate({
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
  source: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "subagent source is required" }),
  ),
  enabled: enabledFieldSchema,
  authored: authoredFieldSchema,
}).annotate({
  identifier: "SubagentEntryObject",
  title: "Subagent Entry Object",
  description: "A subagent with its source location and whether it's enabled.",
});

/**
 * Union of subagent entry forms: plain source string or object with source + enabled + authored.
 *
 * Decodes to canonical `{ source, enabled, authored }` form; encodes back to
 * the most compact JSON representation (plain string when enabled and not
 * authored, object otherwise).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentEntrySchema = compactOrVerboseEntry(
  SubagentEntryObjectSchema,
  Schema.Struct({
    source: Schema.String,
    enabled: Schema.Boolean,
    authored: Schema.Boolean,
  }).annotate({
    identifier: "SubagentEntry",
    title: "Subagent Entry",
    description:
      "A subagent reference — either a source string like @owner/subagents/name or an object with source, enabled, and authored.",
  }),
  {
    decode: (entry: string | EnabledEntryObject): EnabledEntry =>
      typeof entry === "string"
        ? { source: entry, enabled: true, authored: false }
        : {
            source: entry.source,
            enabled: entry.enabled ?? true,
            authored: entry.authored ?? false,
          },
    encode: (entry: EnabledEntry): string | EnabledEntryObject => {
      if (entry.enabled && !entry.authored) return entry.source;
      const obj: { source: string; enabled?: boolean; authored?: boolean } = {
        source: entry.source,
      };
      if (!entry.enabled) obj.enabled = false;
      if (entry.authored) obj.authored = true;
      return obj;
    },
  },
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
export const SubagentsMapSchema = Schema.Record(
  ExtensionMapKeySchema,
  SubagentEntrySchema,
).annotate({
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
export const PackEntryObjectSchema = Schema.Struct({
  source: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "pack source is required" }),
  ),
  authored: authoredFieldSchema,
}).annotate({
  identifier: "PackEntryObject",
  title: "Pack Entry Object",
  description: "A pack with its source location.",
});

/**
 * Union of pack entry forms: plain source string or object with source + authored.
 *
 * Decodes to canonical `{ source, authored }` form; encodes back to the most
 * compact JSON representation (plain string when not authored, object otherwise).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackEntrySchema = compactOrVerboseEntry(
  PackEntryObjectSchema,
  Schema.Struct({
    source: Schema.String,
    authored: Schema.Boolean,
  }).annotate({
    identifier: "PackEntry",
    title: "Pack Entry",
    description: "A pack reference — either a source string or an object with source and authored.",
  }),
  {
    decode: (entry: string | AuthoredEntryObject): AuthoredEntry =>
      typeof entry === "string"
        ? { source: entry, authored: false }
        : { source: entry.source, authored: entry.authored ?? false },
    encode: (entry: AuthoredEntry): string | AuthoredEntryObject =>
      entry.authored ? { source: entry.source, authored: true } : entry.source,
  },
);

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
export const PacksMapSchema = Schema.Record(ExtensionMapKeySchema, PackEntrySchema).annotate({
  identifier: "PacksMap",
  title: "Packs Map",
  description: "Your installed packs, keyed by name.",
});

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
  "owner",
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
 * - owner: Workspace owner handle used for new/scaffold and reconciliation of non-registry sources
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
  owner: Schema.optional(HandleSchema),
  agents: Schema.optional(Schema.Array(AgentIdSchema)),
  sources: Schema.optional(Schema.Array(SourceHostConfigSchema)),
  commands: Schema.optional(CommandsMapSchema),
  subagents: Schema.optional(SubagentsMapSchema),
  mcpServers: Schema.optional(McpServersMapSchema),
  packs: Schema.optional(PacksMapSchema),
  skills: Schema.optional(SkillsMapSchema),
  ignored: Schema.optional(IgnoredSettingsSchema),
  lint: Schema.optional(LintConfigSchema),
}).annotate({
  identifier: "Settings",
  title: "AXM Settings",
  description:
    "Your workspace configuration — owner, sources, installed extensions, and ignore patterns.",
});

/**
 * Inferred type for Settings schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Settings = Schema.Schema.Type<typeof SettingsSchema>;
