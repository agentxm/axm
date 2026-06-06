/**
 * Schema definitions for AXM settings configuration.
 *
 * Settings define workspace configuration including sources, agents, and extensions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { ConfigurableAgentIdSchema, EXTENSION_NAME_PATTERN } from "../extensions/common.js";
import { FileInputValueSchema } from "../files/manifest-schema.js";
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
  description: "A source host alias: lowercase letters, numbers, hyphens, and dots.",
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

type McpServerEnvInput = Readonly<Record<string, string>> | ReadonlyArray<string>;

type McpServerVerboseEntryObject = {
  readonly source?: string | undefined;
  readonly command?: string | undefined;
  readonly args?: ReadonlyArray<string> | undefined;
  readonly url?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly enabled?: boolean | undefined;
  readonly authored?: boolean | undefined;
  readonly env?: McpServerEnvInput | undefined;
};

type CanonicalMcpServerEntry = {
  readonly source: string;
  readonly command?: string | undefined;
  readonly args?: ReadonlyArray<string> | undefined;
  readonly url?: string | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly enabled: boolean;
  readonly authored: boolean;
  readonly env: Readonly<Record<string, string>>;
};

const ExtensionMapKeySchema = Schema.String.check(
  Schema.isPattern(EXTENSION_NAME_PATTERN, {
    message:
      "Names must be max 64 chars, lowercase letters/numbers/hyphens, not starting or ending with hyphen.",
  }),
);

const authoredFieldSchema = Schema.optionalKey(
  Schema.Boolean.annotate({
    description:
      "Set to true to mark this entry as authored locally in this workspace. Omit otherwise — false is the default and should not be written explicitly.",
    default: false,
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

const McpServerEnvSchema = Schema.Union([
  Schema.Record(Schema.String, Schema.String),
  Schema.Array(Schema.String),
]).annotate({
  identifier: "McpServerEnv",
  title: "MCP Server Env",
  description:
    "MCP environment values as a map or pass-through variable names. Array entries decode to ${VAR} references.",
});

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

const telemetryModeExamples = [true, "errors", false] as const;

/**
 * Telemetry preference for this workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const TelemetryModeSchema = Schema.Union([
  Schema.Boolean,
  Schema.Literal("errors"),
]).annotate({
  identifier: "TelemetryMode",
  title: "Telemetry Mode",
  description:
    '`true` sends usage and error telemetry, `"errors"` sends only errors, and `false` disables telemetry.',
  examples: telemetryModeExamples,
});

/** @experimental */
export type TelemetryMode = Schema.Schema.Type<typeof TelemetryModeSchema>;

/**
 * Context Files input and workspace variable values.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileInputValuesMapSchema = Schema.Record(Schema.String, FileInputValueSchema).annotate(
  {
    identifier: "FilesInputValuesMap",
    title: "Files Input Values Map",
    description: "Scalar values supplied to a Context Files package entry.",
  },
);

/** @experimental */
export type FileInputValuesMap = Schema.Schema.Type<typeof FileInputValuesMapSchema>;

/**
 * Workspace variables available to file templates as `${vars.*}`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const WorkspaceVarsMapSchema = Schema.Record(Schema.String, FileInputValueSchema).annotate({
  identifier: "WorkspaceVarsMap",
  title: "Workspace Vars Map",
  description: "Scalar workspace variables available to Context Files templates.",
});

/** @experimental */
export type WorkspaceVarsMap = Schema.Schema.Type<typeof WorkspaceVarsMapSchema>;

type FilesEntryObject = EnabledEntryObject & {
  readonly inputs?: FileInputValuesMap | undefined;
};

type FilesEntryCanonical = EnabledEntry & {
  readonly inputs: FileInputValuesMap;
};

type RuleEntryCanonical = EnabledEntry;
type HookEntryCanonical = EnabledEntry;

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

/**
 * Managed skill with source and optional config flags.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillEntryObjectSchema = Schema.Struct({
  source: entrySourceFieldSchema("skill", "skills"),
  enabled: enabledFieldSchema,
  authored: authoredFieldSchema,
}).annotate({
  title: "Skill Entry Object",
  description: "A skill entry with source and optional enabled/authored flags.",
});

/**
 * Union of skill entry forms: plain source string or object with source + enabled + authored.
 *
 * Decodes to canonical `{ source, enabled, authored }` form; encodes back to
 * the most compact JSON representation (plain string when enabled and not
 * authored, object otherwise).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillEntrySchema = compactOrVerboseEntry(
  SkillEntryObjectSchema,
  Schema.Struct({
    source: Schema.String,
    enabled: Schema.Boolean,
    authored: Schema.Boolean,
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
  {
    identifier: "SkillEntry",
    title: "Skill Entry",
    description: "A skill entry: a source string, or an object with source plus optional flags.",
    examples: [
      "@acme/skills/code-review@^1.0.0",
      { source: "github:acme/agent-extensions", enabled: false },
    ],
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
  description: "A map of skill names to skill entries.",
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
  source: entrySourceFieldSchema("command", "commands"),
  enabled: enabledFieldSchema,
  authored: authoredFieldSchema,
}).annotate({
  title: "Command Entry Object",
  description: "A command entry with source and optional enabled/authored flags.",
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
  {
    identifier: "CommandEntry",
    title: "Command Entry",
    description: "A command entry: a source string, or an object with source plus optional flags.",
    examples: [
      "@acme/commands/code-review@^1.0.0",
      { source: "github:acme/agent-extensions", enabled: false },
    ],
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
  description: "A map of command names to command entries.",
});

/**
 * Inferred type for CommandsMap schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CommandsMap = Schema.Schema.Type<typeof CommandsMapSchema>;

// -----------------------------------------------------------------------------
// Files Entry Schemas
// -----------------------------------------------------------------------------

/**
 * Managed Context Files package with source, optional config flags, and input values.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FilesEntryObjectSchema = Schema.Struct({
  source: entrySourceFieldSchema("Context Files package", "files"),
  enabled: enabledFieldSchema,
  authored: authoredFieldSchema,
  inputs: Schema.optionalKey(FileInputValuesMapSchema),
}).annotate({
  title: "Files Entry Object",
  description:
    "A Context Files package entry with source, optional flags, and scalar input values.",
});

/**
 * Union of Context Files package entry forms: plain source string or object with source, flags, and inputs.
 *
 * Decodes to canonical `{ source, enabled, authored, inputs }` form; encodes
 * back to a plain source string when all metadata is default and no inputs are
 * set.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FilesEntrySchema = compactOrVerboseEntry(
  FilesEntryObjectSchema,
  Schema.Struct({
    source: Schema.String,
    enabled: Schema.Boolean,
    authored: Schema.Boolean,
    inputs: FileInputValuesMapSchema,
  }),
  {
    decode: (entry: string | FilesEntryObject): FilesEntryCanonical =>
      typeof entry === "string"
        ? { source: entry, enabled: true, authored: false, inputs: {} }
        : {
            source: entry.source,
            enabled: entry.enabled ?? true,
            authored: entry.authored ?? false,
            inputs: entry.inputs ?? {},
          },
    encode: (entry: FilesEntryCanonical): string | FilesEntryObject => {
      const hasInputs = Object.keys(entry.inputs).length > 0;
      if (entry.enabled && !entry.authored && !hasInputs) return entry.source;
      const obj: {
        source: string;
        enabled?: boolean;
        authored?: boolean;
        inputs?: FileInputValuesMap;
      } = { source: entry.source };
      if (!entry.enabled) obj.enabled = false;
      if (entry.authored) obj.authored = true;
      if (hasInputs) obj.inputs = entry.inputs;
      return obj;
    },
  },
  {
    identifier: "FilesEntry",
    title: "Files Entry",
    description:
      "A Context Files package entry: a source string, or an object with source plus optional flags and inputs.",
    examples: [
      "@ac/files/workspace-baseline@^1.0.0",
      {
        source: "@ac/files/workspace-baseline@^1.0.0",
        inputs: { projectName: "agentxm" },
      },
    ],
  },
);

/** @experimental */
export type FilesEntry = Schema.Schema.Type<typeof FilesEntrySchema>;

/**
 * Files map - maps Context Files package names to files entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FilesMapSchema = Schema.Record(ExtensionMapKeySchema, FilesEntrySchema).annotate({
  identifier: "FilesMap",
  title: "Files Map",
  description: "A map of Context Files package names to Context Files package entries.",
});

/** @experimental */
export type FilesMap = Schema.Schema.Type<typeof FilesMapSchema>;

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
  authored: authoredFieldSchema,
}).annotate({
  title: "Rule Entry Object",
  description: "A rule entry with source and optional enabled/authored flags.",
});

/**
 * Union of rule entry forms: plain source string or object with source + enabled + authored.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RuleEntrySchema = compactOrVerboseEntry(
  RuleEntryObjectSchema,
  Schema.Struct({
    source: Schema.String,
    enabled: Schema.Boolean,
    authored: Schema.Boolean,
  }),
  {
    decode: (entry: string | EnabledEntryObject): RuleEntryCanonical =>
      typeof entry === "string"
        ? { source: entry, enabled: true, authored: false }
        : {
            source: entry.source,
            enabled: entry.enabled ?? true,
            authored: entry.authored ?? false,
          },
    encode: (entry: RuleEntryCanonical): string | EnabledEntryObject => {
      if (entry.enabled && !entry.authored) return entry.source;
      const obj: { source: string; enabled?: boolean; authored?: boolean } = {
        source: entry.source,
      };
      if (!entry.enabled) obj.enabled = false;
      if (entry.authored) obj.authored = true;
      return obj;
    },
  },
  {
    identifier: "RuleEntry",
    title: "Rule Entry",
    description: "A rule entry: a source string, or an object with source plus optional flags.",
    examples: [
      "@acme/rules/api-conventions@^1.0.0",
      { source: "@acme/rules/api-conventions@^1.0.0", enabled: false },
    ],
  },
);

/** @experimental */
export type RuleEntry = Schema.Schema.Type<typeof RuleEntrySchema>;

/**
 * Rules map - maps rule names to rule entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RulesMapSchema = Schema.Record(ExtensionMapKeySchema, RuleEntrySchema).annotate({
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
  authored: authoredFieldSchema,
}).annotate({
  title: "Hook Entry Object",
  description: "A hook entry with source and optional enabled/authored flags.",
});

/**
 * Union of hook entry forms: plain source string or object with source + enabled + authored.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const HookEntrySchema = compactOrVerboseEntry(
  HookEntryObjectSchema,
  Schema.Struct({
    source: Schema.String,
    enabled: Schema.Boolean,
    authored: Schema.Boolean,
  }),
  {
    decode: (entry: string | EnabledEntryObject): HookEntryCanonical =>
      typeof entry === "string"
        ? { source: entry, enabled: true, authored: false }
        : {
            source: entry.source,
            enabled: entry.enabled ?? true,
            authored: entry.authored ?? false,
          },
    encode: (entry: HookEntryCanonical): string | EnabledEntryObject => {
      if (entry.enabled && !entry.authored) return entry.source;
      const obj: { source: string; enabled?: boolean; authored?: boolean } = {
        source: entry.source,
      };
      if (!entry.enabled) obj.enabled = false;
      if (entry.authored) obj.authored = true;
      return obj;
    },
  },
  {
    identifier: "HookEntry",
    title: "Hook Entry",
    description: "A hook entry: a source string, or an object with source plus optional flags.",
    examples: [
      "@acme/hooks/block-secrets@^1.0.0",
      { source: "@acme/hooks/block-secrets@^1.0.0", enabled: false },
    ],
  },
);

/** @experimental */
export type HookEntry = Schema.Schema.Type<typeof HookEntrySchema>;

/**
 * Hooks map - maps hook names to hook entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const HooksMapSchema = Schema.Record(ExtensionMapKeySchema, HookEntrySchema).annotate({
  identifier: "HooksMap",
  title: "Hooks Map",
  description: "A map of hook names to hook entries.",
});

/** @experimental */
export type HooksMap = Schema.Schema.Type<typeof HooksMapSchema>;

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
  authored: authoredFieldSchema,
  env: Schema.optionalKey(McpServerEnvSchema),
}).annotate({
  title: "MCP Server Entry Object",
  description: "An MCP server entry with source and optional enabled/authored/env fields.",
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
  authored: authoredFieldSchema,
  env: Schema.optionalKey(McpServerEnvSchema),
}).pipe(
  Schema.check(
    Schema.makeFilter((entry: McpServerVerboseEntryObject) =>
      validateMcpTransportExclusivity(entry),
    ),
  ),
);

/**
 * Union of MCP server entry forms: plain source string or object with source + enabled + authored + env.
 *
 * Decodes to canonical `{ source, enabled, authored, env }` form; encodes back to the most
 * compact JSON representation (plain string when enabled, not authored, and env is empty).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServerEntrySchema = compactOrVerboseEntry(
  McpServerVerboseEntryObjectSchema,
  Schema.Struct({
    source: Schema.String,
    command: Schema.optional(Schema.String),
    args: Schema.optional(Schema.Array(Schema.String)),
    url: Schema.optional(Schema.String),
    headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    enabled: Schema.Boolean,
    authored: Schema.Boolean,
    env: Schema.Record(Schema.String, Schema.String),
  }),
  {
    decode: (entry: string | McpServerVerboseEntryObject): CanonicalMcpServerEntry =>
      typeof entry === "string"
        ? { source: entry, enabled: true, authored: false, env: {} }
        : {
            source: "source" in entry && entry.source !== undefined ? entry.source : "inline",
            ...("command" in entry && entry.command !== undefined
              ? { command: entry.command }
              : {}),
            ...("args" in entry && entry.args !== undefined ? { args: entry.args } : {}),
            ...("url" in entry && entry.url !== undefined ? { url: entry.url } : {}),
            ...("headers" in entry && entry.headers !== undefined
              ? { headers: entry.headers }
              : {}),
            enabled: entry.enabled ?? true,
            authored: entry.authored ?? false,
            env: decodeMcpEnv(entry.env),
          },
    encode: (entry: CanonicalMcpServerEntry): string | McpServerVerboseEntryObject => {
      if (
        entry.source !== "inline" &&
        entry.enabled &&
        !entry.authored &&
        Object.keys(entry.env).length === 0
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
        authored?: boolean;
        env?: Readonly<Record<string, string>>;
      } = {};
      if (entry.source !== "inline") obj.source = entry.source;
      if (entry.command !== undefined) obj.command = entry.command;
      if (entry.args !== undefined && entry.args.length > 0) obj.args = entry.args;
      if (entry.url !== undefined) obj.url = entry.url;
      if (entry.headers !== undefined && Object.keys(entry.headers).length > 0) {
        obj.headers = entry.headers;
      }
      if (!entry.enabled) obj.enabled = false;
      if (entry.authored) obj.authored = true;
      if (Object.keys(entry.env).length > 0) obj.env = entry.env;
      if (entry.source !== "inline") {
        return {
          source: entry.source,
          ...(obj.enabled === undefined ? {} : { enabled: obj.enabled }),
          ...(obj.authored === undefined ? {} : { authored: obj.authored }),
          ...(obj.env === undefined ? {} : { env: obj.env }),
        };
      }
      if (entry.command !== undefined) {
        return {
          command: entry.command,
          ...(obj.args === undefined ? {} : { args: obj.args }),
          ...(obj.enabled === undefined ? {} : { enabled: obj.enabled }),
          ...(obj.authored === undefined ? {} : { authored: obj.authored }),
          ...(obj.env === undefined ? {} : { env: obj.env }),
        };
      }
      return {
        url: entry.url ?? "",
        ...(obj.headers === undefined ? {} : { headers: obj.headers }),
        ...(obj.enabled === undefined ? {} : { enabled: obj.enabled }),
        ...(obj.authored === undefined ? {} : { authored: obj.authored }),
        ...(obj.env === undefined ? {} : { env: obj.env }),
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
      { command: "npx", args: ["-y", "linear-mcp-server"], env: ["LINEAR_API_KEY"] },
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
  authored: authoredFieldSchema,
}).annotate({
  title: "Subagent Entry Object",
  description: "A subagent entry with source and optional enabled/authored flags.",
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
  {
    identifier: "SubagentEntry",
    title: "Subagent Entry",
    description: "A subagent entry: a source string, or an object with source plus optional flags.",
    examples: [
      "@acme/subagents/reviewer@^1.0.0",
      { source: "github:acme/agent-extensions", enabled: false },
    ],
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
  authored: authoredFieldSchema,
}).annotate({
  title: "Pack Entry Object",
  description: "A pack entry with source and optional authored flag.",
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
  }),
  {
    decode: (entry: string | AuthoredEntryObject): AuthoredEntry =>
      typeof entry === "string"
        ? { source: entry, authored: false }
        : { source: entry.source, authored: entry.authored ?? false },
    encode: (entry: AuthoredEntry): string | AuthoredEntryObject =>
      entry.authored ? { source: entry.source, authored: true } : entry.source,
  },
  {
    identifier: "PackEntry",
    title: "Pack Entry",
    description:
      "A pack entry: a source string, or an object with source plus optional authored flag.",
    examples: [
      "@acme/packs/typescript@^1.0.0",
      { source: "github:acme/agent-extensions", authored: true },
    ],
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
 * Feature-level configuration for skills.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SkillsConfigSchema = Schema.Struct({
  ignore: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: "Installed skill names AXM should leave unmanaged.",
      examples: [["local-*", "legacy-helper"]],
    }),
  ),
}).annotate({
  identifier: "SkillsConfig",
  title: "Skills Config",
  description: "Feature-level configuration for skills.",
});

/** @experimental */
export type SkillsConfig = Schema.Schema.Type<typeof SkillsConfigSchema>;

/**
 * Feature-level configuration for commands.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const CommandsConfigSchema = Schema.Struct({
  ignore: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: "Installed command names AXM should leave unmanaged.",
      examples: [["local-*", "legacy-helper"]],
    }),
  ),
}).annotate({
  identifier: "CommandsConfig",
  title: "Commands Config",
  description: "Feature-level configuration for commands.",
});

/** @experimental */
export type CommandsConfig = Schema.Schema.Type<typeof CommandsConfigSchema>;

/**
 * Feature-level configuration for subagents.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SubagentsConfigSchema = Schema.Struct({
  ignore: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: "Installed subagent names AXM should leave unmanaged.",
      examples: [["local-*", "legacy-helper"]],
    }),
  ),
}).annotate({
  identifier: "SubagentsConfig",
  title: "Subagents Config",
  description: "Feature-level configuration for subagents.",
});

/** @experimental */
export type SubagentsConfig = Schema.Schema.Type<typeof SubagentsConfigSchema>;

/**
 * Feature-level configuration for MCP servers.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const McpServersConfigSchema = Schema.Struct({
  ignore: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: "Installed MCP server names AXM should leave unmanaged.",
      examples: [["local-*", "legacy-helper"]],
    }),
  ),
}).annotate({
  identifier: "McpServersConfig",
  title: "MCP Servers Config",
  description: "Feature-level configuration for MCP servers.",
});

/** @experimental */
export type McpServersConfig = Schema.Schema.Type<typeof McpServersConfigSchema>;

/**
 * Feature-level configuration for packs.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const PacksConfigSchema = Schema.Struct({
  ignore: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: "Installed pack names AXM should leave unmanaged.",
      examples: [["local-*", "legacy-helper"]],
    }),
  ),
}).annotate({
  identifier: "PacksConfig",
  title: "Packs Config",
  description: "Feature-level configuration for packs.",
});

/** @experimental */
export type PacksConfig = Schema.Schema.Type<typeof PacksConfigSchema>;

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
  gitignore: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "Whether AXM manages propagated instruction-file ignore entries in .gitignore.",
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

type RulesConfigInput = {
  readonly instructions?: InstructionsConfigValue | null;
};

/**
 * Rules capability feature config.
 *
 * `instructions: null` decodes to an absent key so setup can treat null and
 * unset consistently.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RulesConfigSchema = Schema.Struct({
  instructions: Schema.optionalKey(
    Schema.Union([Schema.Literal(false), InstructionsConfigSchema, Schema.Null]).annotate({
      description:
        "Instruction-file management: false for manual, object for enabled, null or absent for unset.",
      examples: [false, { fileName: "AGENTS.md", gitignore: true }],
    }),
  ),
})
  .pipe(
    Schema.decodeTo(
      Schema.Struct({
        instructions: Schema.optionalKey(
          Schema.Union([Schema.Literal(false), InstructionsConfigSchema]),
        ),
      }),
      SchemaTransformation.transform<
        { readonly instructions?: InstructionsConfigValue },
        RulesConfigInput
      >({
        decode: (config) => {
          if (config.instructions === null || config.instructions === undefined) return {};
          return { instructions: config.instructions };
        },
        encode: (config) => config,
      }),
    ),
  )
  .annotate({
    identifier: "RulesConfig",
    title: "Rules Config",
    description: "Rules capability settings.",
  });

/** @experimental */
export type RulesConfig = Schema.Schema.Type<typeof RulesConfigSchema>;

/**
 * Canonical key order for settings properties.
 *
 * Used by `writeSettings` to ensure properties
 * appear in the same order as defined in `SettingsSchema`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SETTINGS_KEY_ORDER: ReadonlyArray<string> = [
  "$schema",
  "telemetry",
  "owner",
  "sources",
  "vars",
  "agents",
  "rulesConfig",
  "skills",
  "skillsConfig",
  "commands",
  "commandsConfig",
  "files",
  "rules",
  "hooks",
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
 * - sources: Source provider configurations
 * - vars: Scalar workspace variables available to Context Files templates
 * - agents: List of agent IDs to sync extensions to
 * - rulesConfig: Feature-level configuration for rules capabilities
 * - skills: Desired skills by name to source string
 * - skillsConfig: Feature-level configuration for skills
 * - commands: Desired commands by name to version specifier
 * - commandsConfig: Feature-level configuration for commands
 * - files: Desired Context Files packages by name to source string or input config
 * - rules: Desired rules by name to source string
 * - hooks: Desired hooks by name to source string
 * - subagents: Desired subagents by name to version specifier
 * - subagentsConfig: Feature-level configuration for subagents
 * - packs: Desired packs by name to version specifier
 * - packsConfig: Feature-level configuration for packs
 * - mcpServers: Desired MCP servers by name to version specifier
 * - mcpServersConfig: Feature-level configuration for MCP servers
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SettingsSchema = Schema.Struct({
  $schema: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "URL to the AXM settings JSON Schema. Editors use this to provide autocomplete and validation.",
      examples: ["https://axm.sh/schemas/settings.schema.json"],
    }),
  ),
  telemetry: Schema.optionalKey(
    Schema.Union([TelemetryModeSchema]).annotate({
      description: "Workspace telemetry mode: full, errors-only, or disabled.",
    }),
  ),
  owner: Schema.optionalKey(
    Schema.Union([HandleSchema]).annotate({
      description: "Default owner handle used when AXM scaffolds or resolves workspace extensions.",
    }),
  ),
  agents: Schema.optionalKey(
    Schema.Array(ConfigurableAgentIdSchema)
      .annotate({
        description: "Coding agents AXM should sync managed extensions into.",
        examples: [["claude-code", "codex"]],
      })
      .check(Schema.isUnique()),
  ),
  rulesConfig: Schema.optionalKey(
    Schema.Union([RulesConfigSchema]).annotate({
      description: "Feature-level options for rules capabilities.",
    }),
  ),
  sources: Schema.optionalKey(
    Schema.Array(SourceHostConfigSchema).annotate({
      description: "Named source hosts used to resolve source-scheme entry references.",
    }),
  ),
  vars: Schema.optionalKey(
    Schema.Union([WorkspaceVarsMapSchema]).annotate({
      description: "Scalar workspace variables available to Context Files templates.",
    }),
  ),
  skills: Schema.optionalKey(
    Schema.Union([SkillsMapSchema]).annotate({
      description:
        "Your installed skills, keyed by workspace skill name. Prefer plain source strings; use the object form only to set `enabled: false` or `authored: true`, and never write `enabled: true` or `authored: false` explicitly.",
    }),
  ),
  skillsConfig: Schema.optionalKey(
    Schema.Union([SkillsConfigSchema]).annotate({
      description: "Feature-level options for skill management.",
    }),
  ),
  commands: Schema.optionalKey(
    Schema.Union([CommandsMapSchema]).annotate({
      description:
        "Your installed commands, keyed by workspace command name. Prefer plain source strings; use the object form only to set `enabled: false` or `authored: true`, and never write `enabled: true` or `authored: false` explicitly.",
    }),
  ),
  commandsConfig: Schema.optionalKey(
    Schema.Union([CommandsConfigSchema]).annotate({
      description: "Feature-level options for command management.",
    }),
  ),
  files: Schema.optionalKey(
    Schema.Union([FilesMapSchema]).annotate({
      description:
        "Your installed Context Files packages, keyed by workspace package name. Prefer plain source strings; use the object form only to set `enabled: false`, `authored: true`, or scalar `inputs`.",
    }),
  ),
  rules: Schema.optionalKey(
    Schema.Union([RulesMapSchema]).annotate({
      description:
        "Your installed rules, keyed by workspace rule name. Prefer plain source strings; use the object form only to set `enabled: false` or `authored: true`.",
    }),
  ),
  hooks: Schema.optionalKey(
    Schema.Union([HooksMapSchema]).annotate({
      description:
        "Your installed hooks, keyed by workspace hook name. Prefer plain source strings; use the object form only to set `enabled: false` or `authored: true`.",
    }),
  ),
  subagents: Schema.optionalKey(
    Schema.Union([SubagentsMapSchema]).annotate({
      description:
        "Your installed subagents, keyed by workspace subagent name. Prefer plain source strings; use the object form only to set `enabled: false` or `authored: true`, and never write `enabled: true` or `authored: false` explicitly.",
    }),
  ),
  subagentsConfig: Schema.optionalKey(
    Schema.Union([SubagentsConfigSchema]).annotate({
      description: "Feature-level options for subagent management.",
    }),
  ),
  packs: Schema.optionalKey(
    Schema.Union([PacksMapSchema]).annotate({
      description:
        "Your installed packs, keyed by workspace pack name. Prefer plain source strings; use the object form only to set `authored: true`, and never write `authored: false` explicitly. Pack entries do not support `enabled` yet.",
    }),
  ),
  packsConfig: Schema.optionalKey(
    Schema.Union([PacksConfigSchema]).annotate({
      description: "Feature-level options for pack management.",
    }),
  ),
  mcpServers: Schema.optionalKey(
    Schema.Union([McpServersMapSchema]).annotate({
      description:
        "Your installed MCP servers, keyed by workspace MCP server name. Prefer plain source strings; use the object form only to set `enabled: false`, `authored: true`, or persisted `env` values.",
    }),
  ),
  mcpServersConfig: Schema.optionalKey(
    Schema.Union([McpServersConfigSchema]).annotate({
      description: "Feature-level options for MCP server management.",
    }),
  ),
  lint: Schema.optionalKey(
    Schema.Union([LintConfigSchema]).annotate({
      description: "Lint configuration for `axm lint` in this workspace.",
    }),
  ),
}).annotate({
  identifier: "AxmSettings",
  title: "AXM Settings",
  description:
    "Your workspace configuration — owner, sources, installed extensions, feature config, and lint config.",
  // Examples are emitted verbatim into the generated JSON Schema. We declare
  // them in the encoded (compact) form so agents see the preferred shape:
  // plain source strings, with the object form reserved for non-default flags.
  // Assertion needed: `.annotate()` types examples against the decoded
  // canonical shape (where `enabled`/`authored` are required booleans), but
  // emitting that shape would teach agents to write the very defaults we want
  // them to omit.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  examples: [
    {
      telemetry: "errors",
      agents: ["claude-code", "codex"],
      skills: {
        "code-review": "@acme/skills/code-review@^1.0.0",
        "legacy-rules": { source: "@acme/skills/legacy-rules@^1.0.0", enabled: false },
      },
      vars: {
        projectName: "agentxm",
      },
      files: {
        "workspace-baseline": {
          source: "@ac/files/workspace-baseline@^1.0.0",
          inputs: { projectName: "AgentXM" },
        },
      },
      skillsConfig: {
        ignore: ["local-*"],
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
