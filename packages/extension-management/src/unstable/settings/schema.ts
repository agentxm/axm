/**
 * Schema definitions for AXM settings configuration.
 *
 * Settings define workspace configuration including sources, agents, and extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import {
  ConfigurableAgentIdSchema,
  ExtensionVisibilitySchema,
  EXTENSION_NAME_PATTERN,
} from "@agentxm/extension-model/unstable/extensions/common";
import { ReleaseAgeExcludePatternSchema } from "@agentxm/extension-model/unstable/extensions/fqn-pattern";
import type { CatalogExtensionType } from "@agentxm/extension-model/unstable/extension-types/schema";
import { HandleSchema } from "@agentxm/extension-model/unstable/extensions/handle";
import { LintConfigSchema } from "@agentxm/registry-protocol/unstable/lint/config";
import { isWorkspaceSourceLocator } from "../sources/workspace.js";

// -----------------------------------------------------------------------------
// Source Host Config (array-based, discriminated on `type` field)
// -----------------------------------------------------------------------------

/**
 * Pattern for source names: lowercase alphanumeric, hyphens, and dots.
 * Must start with a letter or digit.
 *
 * @experimental This API is unstable and may change without notice.
 */
const SOURCE_NAME_PATTERN = /^(?!(?:git|local|workspace)$)[a-z0-9][a-z0-9.-]*$/;

const SourceNameSchema = Schema.String.check(
  Schema.isPattern(SOURCE_NAME_PATTERN, {
    message:
      'source name must start with a letter or digit, contain only lowercase alphanumeric characters, hyphens, and dots, and must not be a reserved name: "git", "local", or "workspace"',
  }),
).annotate({
  identifier: "SourceName",
  title: "Source Name",
  description:
    'A source host alias: lowercase letters, numbers, hyphens, and dots. The names "git", "local", and "workspace" are reserved.',
  examples: ["github", "my-registry.dev"],
});

const sourceNameFieldSchema = SourceNameSchema.pipe(
  Schema.annotateKey({ messageMissingKey: "source name is required" }),
  Schema.annotate({
    description: "Alias used in entry source strings for this source host.",
  }),
);

const sourceUrlFieldSchema = Schema.URLFromString.pipe(
  Schema.annotateKey({ messageMissingKey: "source url is required" }),
  Schema.annotate({
    description: "Base URL for this source host endpoint.",
  }),
);

/**
 * GitHub source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const GitHubSourceHostConfigSchema = Schema.Struct({
  name: sourceNameFieldSchema,
  type: Schema.Literal("github"),
  url: sourceUrlFieldSchema,
}).annotate({
  identifier: "GitHubSourceHostConfig",
  title: "GitHub Source Host",
  description: "A GitHub source host.",
});

/**
 * GitLab source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const GitLabSourceHostConfigSchema = Schema.Struct({
  name: sourceNameFieldSchema,
  type: Schema.Literal("gitlab"),
  url: sourceUrlFieldSchema,
}).annotate({
  identifier: "GitLabSourceHostConfig",
  title: "GitLab Source Host",
  description: "A GitLab source host.",
});

/**
 * Bitbucket source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const BitbucketSourceHostConfigSchema = Schema.Struct({
  name: sourceNameFieldSchema,
  type: Schema.Literal("bitbucket"),
  url: sourceUrlFieldSchema,
}).annotate({
  identifier: "BitbucketSourceHostConfig",
  title: "Bitbucket Source Host",
  description: "A Bitbucket source host.",
});

/**
 * Azure Repos source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const AzureReposSourceHostConfigSchema = Schema.Struct({
  name: sourceNameFieldSchema,
  type: Schema.Literal("azurerepos"),
  url: sourceUrlFieldSchema,
}).annotate({
  identifier: "AzureReposSourceHostConfig",
  title: "Azure Repos Source Host",
  description: "An Azure Repos source host.",
});

/**
 * Registry source host configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
const RegistrySourceHostConfigSchema = Schema.Struct({
  name: sourceNameFieldSchema,
  type: Schema.Literal("registry"),
  location: Schema.URLFromString.pipe(
    Schema.annotateKey({ messageMissingKey: "source location is required" }),
    Schema.annotate({
      description:
        "Registry endpoint for this source; accepts http(s)://, file://, or local paths.",
    }),
  ),
}).annotate({
  identifier: "RegistrySourceHostConfig",
  title: "Registry Source Host",
  description: "A package registry source host.",
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
    "A source host configuration: GitHub, GitLab, Bitbucket, Azure Repos, or a package registry.",
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

type SourceEntryObject = {
  readonly source: string;
};

type SourceEntry = {
  readonly source: string;
};

type EnabledEntryObject = SourceEntryObject & {
  readonly enabled?: boolean | undefined;
};

type EnabledEntry = SourceEntry & {
  readonly enabled: boolean;
};

type KnowledgeEntryObject = EnabledEntryObject & {
  readonly instructionEntry?: boolean | undefined;
};

type CanonicalKnowledgeEntry = EnabledEntry & {
  readonly instructionEntry?: boolean | undefined;
};

type SkillEntryObject = {
  readonly source: string;
  readonly enabled?: boolean;
  readonly origin?: "bundled";
};

type CanonicalSkillEntry = EnabledEntry & {
  readonly origin?: "bundled";
};

type McpServerEnvInput = Readonly<Record<string, string>> | ReadonlyArray<string>;

type McpServerVerboseEntryObject = {
  readonly source?: string | undefined;
  readonly command?: string | undefined;
  readonly args?: ReadonlyArray<string> | undefined;
  readonly url?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly enabled?: boolean | undefined;
  readonly env?: McpServerEnvInput | undefined;
  readonly agents?: ReadonlyArray<typeof ConfigurableAgentIdSchema.Type> | undefined;
};

type CanonicalSourcedMcpServerEntry = {
  readonly kind?: "sourced" | undefined;
  readonly source: string;
  readonly command?: string | undefined;
  readonly args?: ReadonlyArray<string> | undefined;
  readonly url?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly enabled: boolean;
  readonly env: Readonly<Record<string, string>>;
  readonly agents?: ReadonlyArray<typeof ConfigurableAgentIdSchema.Type> | undefined;
};

type CanonicalInlineMcpServerEntry = {
  readonly kind: "inline";
  readonly source?: undefined;
  readonly command?: string | undefined;
  readonly args?: ReadonlyArray<string> | undefined;
  readonly url?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly enabled: boolean;
  readonly env: Readonly<Record<string, string>>;
  readonly agents?: ReadonlyArray<typeof ConfigurableAgentIdSchema.Type> | undefined;
};

type CanonicalMcpServerEntry = CanonicalSourcedMcpServerEntry | CanonicalInlineMcpServerEntry;

const ExtensionMapKeySchema = Schema.String.check(
  Schema.isPattern(EXTENSION_NAME_PATTERN, {
    message:
      "Names must be max 64 chars, lowercase letters/numbers/hyphens, not starting or ending with hyphen.",
  }),
);

const enabledFieldSchema = Schema.optionalKey(
  Schema.Boolean.annotate({
    description:
      "Set to false to disable this entry. Omit otherwise — true is the default and should not be written explicitly.",
    default: true,
  }),
);

const entrySourceFieldSchema = (label: string, fqnType: string) =>
  Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: `${label} source is required` }),
    Schema.annotate({
      description:
        "FQN with optional version constraint, source-scheme ref like github:owner/repo, or local path.",
      examples: [
        `@acme/${fqnType}/code-review@^1.0.0`,
        "github:acme/agent-extensions",
        "./extensions/code-review",
      ],
    }),
  );

const workspaceEntriesMatch = (pluralType: string) =>
  Schema.makeFilter((entries: Readonly<Record<string, { readonly source: string }>>) => {
    for (const [entryName, entry] of Object.entries(entries)) {
      if (entry.source.startsWith("workspace:") || entry.source === "authored") {
        return `Workspace package "${entryName}" must use the compact source "workspace" in ${pluralType}`;
      }
      if (!isWorkspaceSourceLocator(entry.source)) continue;
    }
    return undefined;
  });

const mcpWorkspaceEntriesMatch = Schema.makeFilter(
  (entries: Readonly<Record<string, CanonicalMcpServerEntry>>) => {
    for (const [entryName, entry] of Object.entries(entries)) {
      if (entry.kind !== "sourced") continue;
      if (entry.source.startsWith("workspace:") || entry.source === "authored") {
        return `Workspace package "${entryName}" must use the compact source "workspace" in mcps`;
      }
    }
    return undefined;
  },
);

const McpServerEnvSchema = Schema.Union([
  Schema.Record(Schema.String, Schema.String),
  Schema.Array(Schema.String),
]).annotate({
  identifier: "McpServerEnv",
  title: "MCP Server Env",
  description:
    "MCP environment values as a map or pass-through variable names. Array entries decode to ${VAR} references.",
});

const McpServerAgentsSchema = Schema.Array(ConfigurableAgentIdSchema)
  .annotate({
    description: "Coding agents this MCP server applies to. Omit to target every configured agent.",
    examples: [["claude-code", "codex"]],
  })
  .check(Schema.isMinLength(1), Schema.isUnique());

const decodeMcpEnv = (env: McpServerEnvInput | undefined): Readonly<Record<string, string>> => {
  if (env === undefined) return {};
  if (Array.isArray(env)) {
    return Object.fromEntries(env.map((name) => [name, `\${${name}}`]));
  }
  return Object.fromEntries(Object.entries(env));
};

const hasOwnKey = (entry: Readonly<Record<string, unknown>>, key: string): boolean =>
  Object.hasOwn(entry, key) && entry[key] !== undefined;

const validateMcpTransportExclusivity = (
  entry: Readonly<Record<string, unknown>>,
): string | undefined => {
  const transports = ["source", "command", "url"].filter((key) => hasOwnKey(entry, key));
  if (transports.length !== 1) {
    return "MCP server entry must include exactly one of source, command, or url";
  }
  if (hasOwnKey(entry, "source") && (hasOwnKey(entry, "args") || hasOwnKey(entry, "headers"))) {
    return "MCP server source entries cannot include args or headers";
  }
  if (hasOwnKey(entry, "command") && hasOwnKey(entry, "headers")) {
    return "MCP server command entries cannot include headers";
  }
  if (hasOwnKey(entry, "url") && hasOwnKey(entry, "args")) {
    return "MCP server URL entries cannot include args";
  }
  return undefined;
};

export const MinimumReleaseAgeSchema = Schema.String.check(
  Schema.isPattern(/^\d+(ms|s|m|h|d)$/, {
    message: "minimumReleaseAge must be a duration such as 24h, 1440m, or 0s",
  }),
).annotate({
  identifier: "MinimumReleaseAge",
  title: "Minimum Release Age",
  description:
    "Minimum age for registry versions during unattended resolution. Use 0s to disable the holdback.",
  default: "24h",
  examples: ["24h", "1440m", "0s"],
});

/** @experimental */
export type MinimumReleaseAge = Schema.Schema.Type<typeof MinimumReleaseAgeSchema>;

/** @experimental */
export type MinimumReleaseAgeExclude = ReadonlyArray<typeof ReleaseAgeExcludePatternSchema.Type>;

const compactOrVerboseEntry = <
  ObjectEntry,
  CanonicalEntry,
  ObjectSchema extends Schema.Codec<ObjectEntry, ObjectEntry>,
  CanonicalSchema extends Schema.Codec<CanonicalEntry, CanonicalEntry>,
>(
  objectSchema: ObjectSchema,
  canonicalSchema: CanonicalSchema,
  transformation: {
    readonly decode: (entry: string | ObjectEntry) => CanonicalEntry;
    readonly encode: (entry: CanonicalEntry) => string | ObjectEntry;
  },
  annotations: {
    readonly identifier: string;
    readonly title: string;
    readonly description: string;
    readonly examples: ReadonlyArray<string | ObjectEntry>;
  },
) =>
  Schema.Union([Schema.String, objectSchema])
    .annotate(annotations)
    .pipe(
      Schema.decodeTo(
        canonicalSchema,
        SchemaTransformation.transform<CanonicalEntry, string | ObjectEntry>(transformation),
      ),
    );

const EnabledEntryCanonicalSchema = Schema.Struct({
  source: Schema.String,
  enabled: Schema.Boolean,
});

const decodeEnabledEntry = (entry: string | EnabledEntryObject): EnabledEntry =>
  typeof entry === "string"
    ? { source: entry, enabled: true }
    : {
        source: entry.source,
        enabled: entry.enabled ?? true,
      };

const encodeEnabledEntry = (entry: EnabledEntry): string | EnabledEntryObject => {
  if (entry.enabled) return entry.source;
  const obj: { source: string; enabled?: boolean } = {
    source: entry.source,
  };
  if (!entry.enabled) obj.enabled = false;
  return obj;
};

const enabledEntryTransformation = {
  decode: decodeEnabledEntry,
  encode: encodeEnabledEntry,
};

const compactEnabledEntry = (
  objectSchema: Schema.Codec<EnabledEntryObject, EnabledEntryObject>,
  annotations: {
    readonly identifier: string;
    readonly title: string;
    readonly description: string;
    readonly examples: ReadonlyArray<string | EnabledEntryObject>;
  },
) =>
  compactOrVerboseEntry(
    objectSchema,
    EnabledEntryCanonicalSchema,
    enabledEntryTransformation,
    annotations,
  );

/**
 * Managed skill with source and optional config flags.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillEntryObjectSchema = Schema.Struct({
  source: entrySourceFieldSchema("skill", "skills"),
  enabled: enabledFieldSchema,
  origin: Schema.optionalKey(
    Schema.Literal("bundled").annotate({
      description:
        "Marks the official AXM skill as materialized from the running CLI's embedded bundle.",
    }),
  ),
}).annotate({
  title: "Skill Entry Object",
  description: "A skill entry with source, optional enabled state, and bundled origin marker.",
});

const SkillEntryCanonicalSchema = Schema.Struct({
  source: Schema.String,
  enabled: Schema.Boolean,
  origin: Schema.optionalKey(Schema.Literal("bundled")),
});

const decodeSkillEntry = (entry: string | SkillEntryObject): CanonicalSkillEntry =>
  typeof entry === "string"
    ? { source: entry, enabled: true }
    : {
        source: entry.source,
        enabled: entry.enabled ?? true,
        ...(entry.origin === undefined ? {} : { origin: entry.origin }),
      };

const encodeSkillEntry = (entry: CanonicalSkillEntry): string | SkillEntryObject => {
  if (entry.enabled && entry.origin === undefined) return entry.source;
  return {
    source: entry.source,
    ...(!entry.enabled ? { enabled: false } : {}),
    ...(entry.origin === undefined ? {} : { origin: entry.origin }),
  };
};

/**
 * Union of skill entry forms: plain source string or object with source + enabled.
 *
 * Decodes to canonical `{ source, enabled }` form; encodes back to the most
 * compact JSON representation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillEntrySchema = Schema.Union([Schema.String, SkillEntryObjectSchema])
  .annotate({
    identifier: "SkillEntry",
    title: "Skill Entry",
    description:
      "A skill entry: a source string, or an object with source plus optional flags and bundled origin.",
    examples: [
      "@acme/skills/code-review@^1.0.0",
      { source: "github:acme/agent-extensions", enabled: false },
    ],
  })
  .pipe(
    Schema.decodeTo(
      SkillEntryCanonicalSchema,
      SchemaTransformation.transform<CanonicalSkillEntry, string | SkillEntryObject>({
        decode: decodeSkillEntry,
        encode: encodeSkillEntry,
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
  .check(Schema.isPropertyNames(ExtensionMapKeySchema))
  .check(workspaceEntriesMatch("skills"))
  .annotate({
    identifier: "SkillsMap",
    title: "Skills Map",
    description: "A map of skill names to skill entries.",
  });

/**
 * Inferred type for SkillsMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SkillsMap = Schema.Schema.Type<typeof SkillsMapSchema>;

// -----------------------------------------------------------------------------
// Rule Entry Schemas
// -----------------------------------------------------------------------------

/**
 * Managed rule with source and optional config flags.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RuleEntryObjectSchema = Schema.Struct({
  source: entrySourceFieldSchema("rule", "rules"),
  enabled: enabledFieldSchema,
}).annotate({
  title: "Rule Entry Object",
  description: "A rule entry with source and an optional enabled flag.",
});

/**
 * Union of rule entry forms: plain source string or object with source + enabled.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RuleEntrySchema = compactEnabledEntry(RuleEntryObjectSchema, {
  identifier: "RuleEntry",
  title: "Rule Entry",
  description: "A rule entry: a source string, or an object with source plus optional flags.",
  examples: [
    "@acme/rules/api-conventions@^1.0.0",
    { source: "@acme/rules/api-conventions@^1.0.0", enabled: false },
  ],
});

/** @experimental */
export type RuleEntry = Schema.Schema.Type<typeof RuleEntrySchema>;

/**
 * Rules map - maps rule names to rule entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RulesMapSchema = Schema.Record(Schema.String, RuleEntrySchema)
  .check(Schema.isPropertyNames(ExtensionMapKeySchema))
  .check(workspaceEntriesMatch("rules"))
  .annotate({
    identifier: "RulesMap",
    title: "Rules Map",
    description: "A map of rule names to rule entries.",
  });

/** @experimental */
export type RulesMap = Schema.Schema.Type<typeof RulesMapSchema>;

// -----------------------------------------------------------------------------
// Hook Entry Schemas
// -----------------------------------------------------------------------------

/**
 * Managed hook with source and optional config flags.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const HookEntryObjectSchema = Schema.Struct({
  source: entrySourceFieldSchema("hook", "hooks"),
  enabled: enabledFieldSchema,
}).annotate({
  title: "Hook Entry Object",
  description: "A hook entry with source and an optional enabled flag.",
});

/**
 * Union of hook entry forms: plain source string or object with source + enabled.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const HookEntrySchema = compactEnabledEntry(HookEntryObjectSchema, {
  identifier: "HookEntry",
  title: "Hook Entry",
  description: "A hook entry: a source string, or an object with source plus optional flags.",
  examples: [
    "@acme/hooks/block-secrets@^1.0.0",
    { source: "@acme/hooks/block-secrets@^1.0.0", enabled: false },
  ],
});

/** @experimental */
export type HookEntry = Schema.Schema.Type<typeof HookEntrySchema>;

/**
 * Hooks map - maps hook names to hook entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const HooksMapSchema = Schema.Record(Schema.String, HookEntrySchema)
  .check(Schema.isPropertyNames(ExtensionMapKeySchema))
  .check(workspaceEntriesMatch("hooks"))
  .annotate({
    identifier: "HooksMap",
    title: "Hooks Map",
    description: "A map of hook names to hook entries.",
  });

/** @experimental */
export type HooksMap = Schema.Schema.Type<typeof HooksMapSchema>;

// -----------------------------------------------------------------------------
// Knowledge Entry Schemas
// -----------------------------------------------------------------------------

export const KnowledgeEntryObjectSchema = Schema.Struct({
  source: entrySourceFieldSchema("knowledge bundle", "knowledge"),
  enabled: enabledFieldSchema,
  instructionEntry: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "Include this bundle in the managed Knowledge Bundles instruction table. Omit to inherit the manifest default.",
    }),
  ),
}).annotate({
  title: "Knowledge Entry Object",
  description:
    "A knowledge bundle entry with source, optional enabled state, and an optional instruction-entry override.",
});

const KnowledgeEntryCanonicalSchema = Schema.Struct({
  source: Schema.String,
  enabled: Schema.Boolean,
  instructionEntry: Schema.optionalKey(Schema.Boolean),
});

const decodeKnowledgeEntry = (entry: string | KnowledgeEntryObject): CanonicalKnowledgeEntry =>
  typeof entry === "string"
    ? { source: entry, enabled: true }
    : {
        source: entry.source,
        enabled: entry.enabled ?? true,
        ...(entry.instructionEntry === undefined
          ? {}
          : { instructionEntry: entry.instructionEntry }),
      };

const encodeKnowledgeEntry = (entry: CanonicalKnowledgeEntry): string | KnowledgeEntryObject => {
  if (entry.enabled && entry.instructionEntry === undefined) return entry.source;
  return {
    source: entry.source,
    ...(!entry.enabled ? { enabled: false } : {}),
    ...(entry.instructionEntry === undefined ? {} : { instructionEntry: entry.instructionEntry }),
  };
};

export const KnowledgeEntrySchema = compactOrVerboseEntry(
  KnowledgeEntryObjectSchema,
  KnowledgeEntryCanonicalSchema,
  { decode: decodeKnowledgeEntry, encode: encodeKnowledgeEntry },
  {
    identifier: "KnowledgeEntry",
    title: "Knowledge Entry",
    description:
      "A knowledge bundle source string, or an object with optional lifecycle and instruction-entry settings.",
    examples: [
      "@acme/knowledge/payments@^1.0.0",
      { source: "@acme/knowledge/payments@^1.0.0", enabled: false },
      { source: "@acme/knowledge/payments@^1.0.0", instructionEntry: false },
    ],
  },
);

export type KnowledgeEntry = Schema.Schema.Type<typeof KnowledgeEntrySchema>;

export const KnowledgeMapSchema = Schema.Record(Schema.String, KnowledgeEntrySchema)
  .check(Schema.isPropertyNames(ExtensionMapKeySchema))
  .check(workspaceEntriesMatch("knowledge"))
  .annotate({
    identifier: "KnowledgeMap",
    title: "Knowledge Map",
    description: "A map of isolated Open Knowledge Format bundles.",
  });

export type KnowledgeMap = Schema.Schema.Type<typeof KnowledgeMapSchema>;

// -----------------------------------------------------------------------------
// MCP Server Entry Schemas
// -----------------------------------------------------------------------------

/**
 * MCP server entry object with source.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerEntryObjectSchema = Schema.Struct({
  source: entrySourceFieldSchema("MCP server", "mcps"),
  enabled: enabledFieldSchema,
  env: Schema.optionalKey(McpServerEnvSchema),
  agents: Schema.optionalKey(McpServerAgentsSchema),
}).annotate({
  title: "MCP Server Entry Object",
  description: "An MCP server entry with source and optional enabled/env fields.",
});

const McpServerVerboseEntryObjectSchema = Schema.Struct({
  source: Schema.optionalKey(entrySourceFieldSchema("MCP server", "mcps")),
  command: Schema.optionalKey(
    Schema.NonEmptyString.pipe(
      Schema.annotate({
        description: "Executable command for an inline stdio MCP server.",
        examples: ["npx"],
      }),
    ),
  ),
  args: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: "Arguments passed to the inline stdio MCP server command.",
      examples: [["-y", "linear-mcp-server"]],
    }),
  ),
  url: Schema.optionalKey(
    Schema.NonEmptyString.pipe(
      Schema.annotate({
        description: "Remote MCP server URL.",
        examples: ["https://mcp.sentry.dev/sse"],
      }),
    ),
  ),
  headers: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String).annotate({
      description: "HTTP headers for a remote MCP server. Prefer ${VAR} references for secrets.",
    }),
  ),
  enabled: enabledFieldSchema,
  env: Schema.optionalKey(McpServerEnvSchema),
  agents: Schema.optionalKey(McpServerAgentsSchema),
}).pipe(
  Schema.check(
    Schema.makeFilter((entry: McpServerVerboseEntryObject) =>
      validateMcpTransportExclusivity(entry),
    ),
  ),
);

/**
 * Union of MCP server entry forms: plain source string or object with source + enabled + env.
 *
 * Decodes to canonical `{ source, enabled, env }` form; encodes back to the most
 * compact JSON representation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerEntrySchema = compactOrVerboseEntry(
  McpServerVerboseEntryObjectSchema,
  Schema.Union([
    Schema.Struct({
      kind: Schema.optional(Schema.Literal("sourced")),
      source: Schema.String,
      command: Schema.optional(Schema.String),
      args: Schema.optional(Schema.Array(Schema.String)),
      url: Schema.optional(Schema.String),
      headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
      enabled: Schema.Boolean,
      env: Schema.Record(Schema.String, Schema.String),
      agents: Schema.optional(Schema.Array(ConfigurableAgentIdSchema)),
    }),
    Schema.Struct({
      kind: Schema.Literal("inline"),
      source: Schema.optional(Schema.Never),
      command: Schema.optional(Schema.String),
      args: Schema.optional(Schema.Array(Schema.String)),
      url: Schema.optional(Schema.String),
      headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
      enabled: Schema.Boolean,
      env: Schema.Record(Schema.String, Schema.String),
      agents: Schema.optional(Schema.Array(ConfigurableAgentIdSchema)),
    }),
  ]),
  {
    decode: (entry: string | McpServerVerboseEntryObject): CanonicalMcpServerEntry =>
      typeof entry === "string"
        ? { kind: "sourced", source: entry, enabled: true, env: {} }
        : entry.source !== undefined
          ? {
              kind: "sourced",
              source: entry.source,
              enabled: entry.enabled ?? true,
              env: decodeMcpEnv(entry.env),
              ...(entry.agents === undefined ? {} : { agents: entry.agents }),
            }
          : {
              kind: "inline",
              ...(entry.command === undefined ? {} : { command: entry.command }),
              ...(entry.args === undefined ? {} : { args: entry.args }),
              ...(entry.url === undefined ? {} : { url: entry.url }),
              ...(entry.headers === undefined ? {} : { headers: entry.headers }),
              enabled: entry.enabled ?? true,
              env: decodeMcpEnv(entry.env),
              ...(entry.agents === undefined ? {} : { agents: entry.agents }),
            },
    encode: (entry: CanonicalMcpServerEntry): string | McpServerVerboseEntryObject => {
      if (
        entry.kind !== "inline" &&
        entry.enabled &&
        Object.keys(entry.env).length === 0 &&
        entry.agents === undefined
      ) {
        return entry.source;
      }
      const obj: {
        source?: string;
        command?: string;
        args?: ReadonlyArray<string>;
        url?: string;
        headers?: Readonly<Record<string, string>>;
        enabled?: boolean;
        env?: Readonly<Record<string, string>>;
        agents?: ReadonlyArray<typeof ConfigurableAgentIdSchema.Type>;
      } = {};
      if (entry.kind !== "inline") obj.source = entry.source;
      if (entry.kind === "inline" && entry.command !== undefined) obj.command = entry.command;
      if (entry.kind === "inline" && entry.args !== undefined && entry.args.length > 0)
        obj.args = entry.args;
      if (entry.kind === "inline" && entry.url !== undefined) obj.url = entry.url;
      if (
        entry.kind === "inline" &&
        entry.headers !== undefined &&
        Object.keys(entry.headers).length > 0
      ) {
        obj.headers = entry.headers;
      }
      if (!entry.enabled) obj.enabled = false;
      if (Object.keys(entry.env).length > 0) obj.env = entry.env;
      if (entry.agents !== undefined) obj.agents = entry.agents;
      if (entry.kind !== "inline") {
        return {
          source: entry.source,
          ...(obj.enabled === undefined ? {} : { enabled: obj.enabled }),
          ...(obj.env === undefined ? {} : { env: obj.env }),
          ...(obj.agents === undefined ? {} : { agents: obj.agents }),
        };
      }
      if (entry.command !== undefined) {
        return {
          command: entry.command,
          ...(obj.args === undefined ? {} : { args: obj.args }),
          ...(obj.enabled === undefined ? {} : { enabled: obj.enabled }),
          ...(obj.env === undefined ? {} : { env: obj.env }),
          ...(obj.agents === undefined ? {} : { agents: obj.agents }),
        };
      }
      return {
        url: entry.url ?? "",
        ...(obj.headers === undefined ? {} : { headers: obj.headers }),
        ...(obj.enabled === undefined ? {} : { enabled: obj.enabled }),
        ...(obj.env === undefined ? {} : { env: obj.env }),
        ...(obj.agents === undefined ? {} : { agents: obj.agents }),
      };
    },
  },
  {
    identifier: "McpServerEntry",
    title: "MCP Server Entry",
    description:
      "An MCP server entry: a source string, sourced object, inline command object, or inline URL object.",
    examples: [
      "@acme/mcps/context@^1.0.0",
      { source: "github:acme/agent-extensions", enabled: false },
      {
        command: "npx",
        args: ["-y", "linear-mcp-server"],
        env: ["LINEAR_API_KEY"],
        agents: ["claude-code"],
      },
      { url: "https://mcp.sentry.dev/sse", headers: { Authorization: "Bearer ${SENTRY_TOKEN}" } },
    ],
  },
);

/**
 * Inferred type for McpServerEntry schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type McpServerEntry = Schema.Schema.Type<typeof McpServerEntrySchema>;

export const isSourcedMcpServerEntry = (
  entry: McpServerEntry,
): entry is McpServerEntry & { readonly source: string } => entry.kind !== "inline";

export const isInlineMcpServerEntry = (
  entry: McpServerEntry,
): entry is Extract<McpServerEntry, { readonly kind: "inline" }> => entry.kind === "inline";

/**
 * MCP servers map - maps MCP server names to MCP server entries.
 *
 * Keys use the canonical MCP server name schema from the shared kernel.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServersMapSchema = Schema.Record(Schema.String, McpServerEntrySchema)
  .check(Schema.isPropertyNames(ExtensionMapKeySchema))
  .check(mcpWorkspaceEntriesMatch)
  .annotate({
    identifier: "McpServersMap",
    title: "MCP Servers Map",
    description: "A map of MCP server names to MCP server entries.",
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
  source: entrySourceFieldSchema("subagent", "subagents"),
  enabled: enabledFieldSchema,
}).annotate({
  title: "Subagent Entry Object",
  description: "A subagent entry with source and an optional enabled flag.",
});

/**
 * Union of subagent entry forms: plain source string or object with source + enabled.
 *
 * Decodes to canonical `{ source, enabled }` form; encodes back to the most
 * compact JSON representation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentEntrySchema = compactEnabledEntry(SubagentEntryObjectSchema, {
  identifier: "SubagentEntry",
  title: "Subagent Entry",
  description: "A subagent entry: a source string, or an object with source plus optional flags.",
  examples: [
    "@acme/subagents/reviewer@^1.0.0",
    { source: "github:acme/agent-extensions", enabled: false },
  ],
});

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
  .check(Schema.isPropertyNames(ExtensionMapKeySchema))
  .check(workspaceEntriesMatch("subagents"))
  .annotate({
    identifier: "SubagentsMap",
    title: "Subagents Map",
    description: "A map of subagent names to subagent entries.",
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
  source: entrySourceFieldSchema("pack", "packs"),
  enabled: enabledFieldSchema,
}).annotate({
  title: "Pack Entry Object",
  description: "A pack entry with a source and an optional enabled flag.",
});

/**
 * Union of pack entry forms: plain source string or object with source.
 *
 * Decodes to canonical `{ source }` form and encodes back to a source string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PackEntrySchema = compactEnabledEntry(PackEntryObjectSchema, {
  identifier: "PackEntry",
  title: "Pack Entry",
  description: "A pack entry: a source string, or an object with source plus optional flags.",
  examples: [
    "@acme/packs/typescript@^1.0.0",
    { source: "@acme/packs/typescript@^1.0.0", enabled: false },
  ],
});

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
 * Values are pack entries: plain source strings or objects with source + enabled.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PacksMapSchema = Schema.Record(Schema.String, PackEntrySchema)
  .check(Schema.isPropertyNames(ExtensionMapKeySchema))
  .check(workspaceEntriesMatch("packs"))
  .annotate({
    identifier: "PacksMap",
    title: "Packs Map",
    description: "A map of pack names to pack entries.",
  });

/**
 * Inferred type for PacksMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PacksMap = Schema.Schema.Type<typeof PacksMapSchema>;

// -----------------------------------------------------------------------------
// Feature Config Schemas
// -----------------------------------------------------------------------------

/**
 * Workspace instruction-file propagation settings.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const InstructionsConfigSchema = Schema.Struct({
  fileName: Schema.optionalKey(
    Schema.String.annotate({
      description: "Source-of-truth instruction file name.",
      default: "AGENTS.md",
      examples: ["AGENTS.md"],
    }),
  ),
  gitignoreAliases: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "Whether AXM adds each exact propagated alias target (e.g. /CLAUDE.md or /docs/CLAUDE.md) to a managed .gitignore region. The source-of-truth file (fileName) is never ignored.",
      default: true,
      examples: [true, false],
    }),
  ),
}).annotate({
  identifier: "InstructionsConfig",
  title: "Instructions Config",
  description: "Instruction-file management settings for configured agents.",
});

/** @experimental */
export type InstructionsConfig = Schema.Schema.Type<typeof InstructionsConfigSchema>;

/** @experimental */
export type InstructionsConfigValue = false | InstructionsConfig;

const authoredDirectoryFieldSchema = Schema.optionalKey(
  Schema.NonEmptyString.annotate({
    description:
      "Workspace-relative authored package directory for this extension type. Omit to use the conventional root directory.",
    examples: ["extensions/skills"],
  }),
);

const authoredDirectoryConfigSchema = (identifier: string, title: string) =>
  Schema.Struct({ dir: authoredDirectoryFieldSchema }).annotate({
    identifier,
    title,
    description:
      "Authored package directory configuration. AXM reads this manual override but never rewrites it.",
  });

export const SkillsConfigSchema = authoredDirectoryConfigSchema("SkillsConfig", "Skills Config");
export const RulesConfigSchema = authoredDirectoryConfigSchema("RulesConfig", "Rules Config");
export const HooksConfigSchema = authoredDirectoryConfigSchema("HooksConfig", "Hooks Config");
export const SubagentsConfigSchema = authoredDirectoryConfigSchema(
  "SubagentsConfig",
  "Subagents Config",
);
export const McpServersConfigSchema = authoredDirectoryConfigSchema(
  "McpServersConfig",
  "MCP Servers Config",
);
export const PacksConfigSchema = authoredDirectoryConfigSchema("PacksConfig", "Packs Config");

export const KnowledgeConfigSchema = Schema.Struct({
  dir: authoredDirectoryFieldSchema,
  instructions: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        "Whether active Knowledge is synchronized into the canonical instruction source. Omit true; persist only false.",
      default: true,
      examples: [false],
    }),
  ),
}).annotate({
  identifier: "KnowledgeConfig",
  title: "Knowledge Config",
  description:
    "Knowledge discovery settings. Omit the config to synchronize active bundles into instructions; set instructions to false to disable that table.",
});

/** @experimental */
export type KnowledgeConfig = Schema.Schema.Type<typeof KnowledgeConfigSchema>;

/** Workspace-level publication defaults. */
export const WorkspacePublishOptionsSchema = Schema.Struct({
  defaultVisibility: Schema.optional(
    ExtensionVisibilitySchema.annotate({
      description:
        "Fallback whole-Extension Registry visibility when an extension manifest does not declare publish.visibility.",
    }),
  ),
}).annotate({
  identifier: "WorkspacePublishOptions",
  title: "Workspace Publish Options",
  description: "Workspace defaults used when extension publication policy is unconfigured.",
});

/** @experimental This API is unstable and may change without notice. */
export type WorkspacePublishOptions = Schema.Schema.Type<typeof WorkspacePublishOptionsSchema>;

/**
 * Each catalog extension type's feature-level config schema, or `null` where
 * none exists yet.
 *
 * Total by construction: a new extension type fails compile here until its
 * settings coverage is decided. The parity conformance suite reads this map,
 * and every `null` must be matched by a ledger row.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SETTINGS_CONFIG_SCHEMA_BY_TYPE = {
  skill: SkillsConfigSchema,
  "mcp-server": McpServersConfigSchema,
  subagent: SubagentsConfigSchema,
  rule: RulesConfigSchema,
  hook: HooksConfigSchema,
  knowledge: KnowledgeConfigSchema,
} as const satisfies Record<CatalogExtensionType, Schema.Top | null>;

/**
 * Canonical key order for settings properties.
 *
 * Used by `writeSettingsAtPath` for new files and to place new top-level keys in
 * existing files whose recognized keys already follow this order.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SETTINGS_KEY_ORDER: ReadonlyArray<string> = [
  "$schema",
  "owner",
  "publish",
  "minimumReleaseAge",
  "minimumReleaseAgeExclude",
  "sources",
  "agents",
  "instructionFiles",
  "skills",
  "skillsConfig",
  "rules",
  "rulesConfig",
  "hooks",
  "hooksConfig",
  "knowledge",
  "knowledgeConfig",
  "subagents",
  "subagentsConfig",
  "packs",
  "packsConfig",
  "mcpServers",
  "mcpServersConfig",
  "lint",
];

/**
 * AXM settings configuration schema.
 *
 * Settings define workspace configuration for AXM including:
 * - owner: Workspace owner handle used for new/scaffold and reconciliation of non-registry sources
 * - minimumReleaseAge: Minimum published age for registry versions during unattended resolution
 * - minimumReleaseAgeExclude: Registry extension identities exempt from minimum release age
 * - sources: Source provider configurations
 * - agents: List of agent IDs to sync extensions to
 * - instructionFiles: Workspace instruction-file propagation settings
 * - skills: Desired skills by name to source string
 * - rules: Desired rules by name to source string
 * - hooks: Desired hooks by name to source string
 * - knowledge: Desired Open Knowledge Format bundles by name to source string
 * - knowledgeConfig: Knowledge discovery-table options
 * - subagents: Desired subagents by name to version specifier
 * - packs: Desired packs by name to version specifier
 * - mcpServers: Desired MCP servers by name to version specifier
 *
 * @experimental This API is unstable and may change without notice.
 */
const SettingsBaseSchema = Schema.Struct({
  $schema: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "URL to the AXM settings JSON Schema. Editors use this to provide autocomplete and validation.",
      examples: ["https://axm.sh/schemas/settings.schema.json"],
    }),
  ),
  owner: Schema.optionalKey(
    Schema.Union([HandleSchema]).annotate({
      description: "Default owner handle used when AXM scaffolds or resolves workspace extensions.",
    }),
  ),
  publish: Schema.optionalKey(
    Schema.Union([WorkspacePublishOptionsSchema]).annotate({
      description: "Workspace-level publication defaults.",
    }),
  ),
  minimumReleaseAge: Schema.optionalKey(
    Schema.Union([MinimumReleaseAgeSchema]).annotate({
      description:
        "Minimum published age for registry versions during unattended sync/update resolution. Defaults to 24h; use 0s to disable.",
    }),
  ),
  minimumReleaseAgeExclude: Schema.optionalKey(
    Schema.Array(ReleaseAgeExcludePatternSchema)
      .annotate({
        description:
          "Registry extension identities exempt from minimumReleaseAge, as exact FQNs, owner/type patterns, or owner patterns.",
      })
      .pipe(
        Schema.annotateEncoded({
          examples: [["@acme/skills/code-review", "@acme/rules/*", "@acme/*"]],
        }),
      )
      .check(Schema.isUnique()),
  ),
  agents: Schema.optionalKey(
    Schema.Array(ConfigurableAgentIdSchema)
      .annotate({
        description: "Coding agents AXM should sync managed extensions into.",
        examples: [["claude-code", "codex"]],
      })
      .check(Schema.isUnique()),
  ),
  instructionFiles: Schema.optionalKey(
    Schema.Union([Schema.Literal(false), InstructionsConfigSchema]).annotate({
      description:
        "Instruction-file management: false for manual management, an object for enabled propagation, or absent when unset.",
      examples: [false, { fileName: "AGENTS.md", gitignoreAliases: true }],
    }),
  ),
  sources: Schema.optionalKey(
    Schema.Array(SourceHostConfigSchema).annotate({
      description: "Named source hosts used to resolve source-scheme entry references.",
    }),
  ),
  skills: Schema.optionalKey(
    Schema.Union([SkillsMapSchema]).annotate({
      description:
        "Desired skills, keyed by workspace skill name. Prefer plain source strings; use the object form only to set `enabled: false`.",
    }),
  ),
  skillsConfig: Schema.optionalKey(SkillsConfigSchema),
  rules: Schema.optionalKey(
    Schema.Union([RulesMapSchema]).annotate({
      description:
        "Desired rules, keyed by workspace rule name. Prefer plain source strings; use the object form only to set `enabled: false`.",
    }),
  ),
  rulesConfig: Schema.optionalKey(RulesConfigSchema),
  hooks: Schema.optionalKey(
    Schema.Union([HooksMapSchema]).annotate({
      description:
        "Desired hooks, keyed by workspace hook name. Prefer plain source strings; use the object form only to set `enabled: false`.",
    }),
  ),
  hooksConfig: Schema.optionalKey(HooksConfigSchema),
  knowledge: Schema.optionalKey(
    Schema.Union([KnowledgeMapSchema]).annotate({
      description: "Desired Open Knowledge Format bundles discovered from agent instruction files.",
    }),
  ),
  knowledgeConfig: Schema.optionalKey(
    Schema.Union([KnowledgeConfigSchema]).annotate({
      description: "Feature-level instruction discovery options for knowledge bundle management.",
    }),
  ),
  subagents: Schema.optionalKey(
    Schema.Union([SubagentsMapSchema]).annotate({
      description:
        "Desired subagents, keyed by workspace subagent name. Prefer plain source strings; use the object form only to set `enabled: false`.",
    }),
  ),
  subagentsConfig: Schema.optionalKey(SubagentsConfigSchema),
  packs: Schema.optionalKey(
    Schema.Union([PacksMapSchema]).annotate({
      description:
        "Desired packs, keyed by workspace pack name. Pack entries do not support `enabled`.",
    }),
  ),
  packsConfig: Schema.optionalKey(PacksConfigSchema),
  mcpServers: Schema.optionalKey(
    Schema.Union([McpServersMapSchema]).annotate({
      description:
        "Desired MCP servers, keyed by workspace MCP server name. Prefer plain source strings; use the object form to set enabled state, persisted env values, or an agent target subset.",
    }),
  ),
  mcpServersConfig: Schema.optionalKey(McpServersConfigSchema),
  lint: Schema.optionalKey(
    Schema.Union([LintConfigSchema]).annotate({
      description: "Lint configuration for `axm lint` in this workspace.",
    }),
  ),
});

// Unknown top-level keys are carried by the rest record so a settings file
// written by a newer AXM survives a read-modify-write cycle instead of being
// silently rewritten without them. Nested strictness is unchanged: unknown
// keys inside entry objects still fail decode. The
// `workspace/settings-keys-recognized` lint rule reports unknown top-level keys
// at error severity.
export const SettingsSchema = Schema.StructWithRest(SettingsBaseSchema, [
  Schema.Record(Schema.String, Schema.Unknown),
]).annotate({
  identifier: "AxmSettings",
  title: "AXM Settings",
  description:
    "Your workspace configuration — owner, sources, installed extensions, feature config, and lint config.",
  // Examples are emitted verbatim into the generated JSON Schema. We declare
  // them in the encoded (compact) form so agents see the preferred shape:
  // plain source strings, with the object form reserved for non-default flags.
  // Assertion needed: `.annotate()` types examples against the decoded
  // canonical shape (where `enabled` is a required boolean), but
  // emitting that shape would teach agents to write the very defaults we want
  // them to omit.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  examples: [
    {
      agents: ["claude-code", "codex"],
      skills: {
        "code-review": "@acme/skills/code-review@^1.0.0",
        "disabled-review": { source: "@acme/skills/disabled-review@^1.0.0", enabled: false },
      },
      lint: {
        rules: {
          "workspace/settings-schema-valid": "error",
        },
      },
    },
  ] as unknown as never,
});

/**
 * Inferred type for Settings schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Settings = Schema.Schema.Type<typeof SettingsSchema>;

/**
 * The recognized top-level settings keys, derived from the schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SETTINGS_KNOWN_KEYS: ReadonlySet<string> = new Set(
  Object.keys(SettingsBaseSchema.fields),
);
