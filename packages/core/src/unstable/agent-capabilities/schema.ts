/**
 * Agent capability catalog schemas.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { ExtensionTypeSchema } from "../extensions/common.js";
import { DocLinkSchema, UrlSchema, type LeafExtensionType } from "../extension-types/schema.js";

export {
  DocLinkSchema,
  LEAF_EXTENSION_TYPES,
  StandardSchema,
  UrlSchema,
  type DocLink,
  type LeafExtensionType,
  type Standard,
  type Url,
} from "../extension-types/schema.js";

const AGENT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** @experimental This API is unstable and may change without notice. */
export const AgentIdFromYamlSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.isPattern(AGENT_ID_PATTERN, {
      message: "Expected a lowercase kebab-case agent id.",
    }),
  ),
).annotate({
  identifier: "AgentId",
  title: "Agent ID",
  description: "Lowercase kebab-case coding agent identifier.",
  examples: ["claude-code", "codex", "cursor"],
});

/** @experimental This API is unstable and may change without notice. */
export type AgentIdFromYaml = Schema.Schema.Type<typeof AgentIdFromYamlSchema>;

/** @experimental This API is unstable and may change without notice. */
export const StandardsComplianceSchema = Schema.Literals([
  "full",
  "parity",
  "partial",
  "none",
]).annotate({
  identifier: "StandardsCompliance",
  title: "Standards Compliance",
  description: "How well a spec-tracked capability's native format matches the named spec.",
  examples: ["full", "parity", "partial"],
});

/** @experimental This API is unstable and may change without notice. */
export type StandardsCompliance = Schema.Schema.Type<typeof StandardsComplianceSchema>;

const ActiveMcpNonFullStandardsComplianceSchema = Schema.Literals(["parity", "partial"]);

/** @experimental This API is unstable and may change without notice. */
export const ConventionSchema = Schema.Literals(["universal", "vendor"]).annotate({
  identifier: "Convention",
  title: "Convention",
  description:
    "Whether a spec-tracked capability uses the spec-defined or community-standard location.",
  examples: ["universal", "vendor"],
});

/** @experimental This API is unstable and may change without notice. */
export type Convention = Schema.Schema.Type<typeof ConventionSchema>;

/** @experimental This API is unstable and may change without notice. */
export const SUPPORTED_LIFECYCLE = "supported" as const;

/** @experimental This API is unstable and may change without notice. */
export const CapabilityLifecycleSchema = Schema.Literals([
  SUPPORTED_LIFECYCLE,
  "planned",
  "unsupported",
  "unknown",
]).annotate({
  identifier: "CapabilityLifecycle",
  title: "Capability Lifecycle",
  description: "State of AXM's integration with an agent capability.",
  examples: [SUPPORTED_LIFECYCLE, "unsupported", "unknown"],
});

/** @experimental This API is unstable and may change without notice. */
export type CapabilityLifecycle = Schema.Schema.Type<typeof CapabilityLifecycleSchema>;

/** @experimental This API is unstable and may change without notice. */
export const ActiveLifecycleSchema = Schema.Literals([SUPPORTED_LIFECYCLE, "planned"]).annotate({
  identifier: "ActiveLifecycle",
  title: "Active Lifecycle",
  description: "Capability lifecycle values that carry a concrete capability claim.",
  examples: [SUPPORTED_LIFECYCLE, "planned"],
});

/** @experimental This API is unstable and may change without notice. */
export type ActiveLifecycle = Schema.Schema.Type<typeof ActiveLifecycleSchema>;

/** @experimental This API is unstable and may change without notice. */
export const InactiveLifecycleSchema = Schema.Literals(["unsupported", "unknown"]).annotate({
  identifier: "InactiveLifecycle",
  title: "Inactive Lifecycle",
  description: "Capability lifecycle values without active extension support.",
  examples: ["unsupported", "unknown"],
});

/** @experimental This API is unstable and may change without notice. */
export type InactiveLifecycle = Schema.Schema.Type<typeof InactiveLifecycleSchema>;

/** @experimental This API is unstable and may change without notice. */
export const ScopeSchema = Schema.Literals(["user", "project"]).annotate({
  identifier: "Scope",
  title: "Scope",
  description: "Where a capability can be configured.",
  examples: ["user", "project"],
});

/** @experimental This API is unstable and may change without notice. */
export type Scope = Schema.Schema.Type<typeof ScopeSchema>;

const NonEmptyScopesSchema = Schema.NonEmptyArray(ScopeSchema).pipe(
  Schema.check(Schema.isUnique()),
);

/** @experimental This API is unstable and may change without notice. */
export const AgentInterfaceSchema = Schema.Literals(["cli", "ide-extension"]).annotate({
  identifier: "AgentInterface",
  title: "Agent Interface",
  description: "Primary product interface where the agent runs.",
  examples: ["cli", "ide-extension"],
});

/** @experimental This API is unstable and may change without notice. */
export type AgentInterface = Schema.Schema.Type<typeof AgentInterfaceSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpTransportSchema = Schema.Literals(["stdio", "http", "sse"]).annotate({
  identifier: "McpTransport",
  title: "MCP Transport",
  description: "MCP transport supported by an agent.",
  examples: ["stdio", "http", "sse"],
});

/** @experimental This API is unstable and may change without notice. */
export type McpTransport = Schema.Schema.Type<typeof McpTransportSchema>;

const NonEmptyMcpTransportsSchema = Schema.NonEmptyArray(McpTransportSchema).pipe(
  Schema.check(Schema.isUnique()),
);

const LegacyDetectionSchema = Schema.Struct({
  projectDirs: Schema.Array(Schema.NonEmptyString).pipe(Schema.check(Schema.isUnique())),
  userDirs: Schema.Array(Schema.NonEmptyString).pipe(Schema.check(Schema.isUnique())),
});

/** @experimental This API is unstable and may change without notice. */
export const DetectionSignalSchema = Schema.Literals([
  "definitive",
  "supporting",
  "ambiguous",
]).annotate({
  identifier: "DetectionSignal",
  title: "Detection Signal",
  description: "How strongly a resolved marker identifies a specific coding agent.",
  examples: ["definitive", "supporting", "ambiguous"],
});

/** @experimental This API is unstable and may change without notice. */
export type DetectionSignal = Schema.Schema.Type<typeof DetectionSignalSchema>;

const DetectionMarkerBaseFields = {
  signal: DetectionSignalSchema,
  note: Schema.NullOr(Schema.NonEmptyString),
};

/** @experimental This API is unstable and may change without notice. */
export const DetectionMarkerSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("dir"),
    path: Schema.NonEmptyString,
    ...DetectionMarkerBaseFields,
  }),
  Schema.Struct({
    kind: Schema.Literal("file"),
    path: Schema.NonEmptyString,
    ...DetectionMarkerBaseFields,
  }),
  Schema.Struct({
    kind: Schema.Literal("executable"),
    name: Schema.NonEmptyString,
    ...DetectionMarkerBaseFields,
  }),
]).annotate({
  identifier: "DetectionMarker",
  title: "Detection Marker",
  description: "Typed marker used to detect an installed or configured coding agent.",
});

/** @experimental This API is unstable and may change without notice. */
export type DetectionMarker = Schema.Schema.Type<typeof DetectionMarkerSchema>;

const detectionMarkerKey = (marker: DetectionMarker): string =>
  marker.kind === "executable" ? `executable:${marker.name}` : `${marker.kind}:${marker.path}`;

/** @experimental This API is unstable and may change without notice. */
export const ScopeDetectionSchema = Schema.Struct({
  markers: Schema.Array(DetectionMarkerSchema).pipe(
    Schema.check(
      Schema.makeFilter((markers: ReadonlyArray<DetectionMarker>) => {
        const seen = new Set<string>();
        for (const marker of markers) {
          const key = detectionMarkerKey(marker);
          if (seen.has(key)) return "Detection markers must be unique by kind and path/name.";
          seen.add(key);
        }
        return undefined;
      }),
    ),
  ),
}).annotate({
  identifier: "ScopeDetection",
  title: "Scope Detection",
  description: "Detection markers for one configuration scope.",
});

/** @experimental This API is unstable and may change without notice. */
export type ScopeDetection = Schema.Schema.Type<typeof ScopeDetectionSchema>;

const CurrentDetectionSchema = Schema.Struct({
  project: ScopeDetectionSchema,
  user: ScopeDetectionSchema,
});

const markerFromLegacyDir = (path: string): DetectionMarker => ({
  kind: "dir",
  path,
  signal: "definitive",
  note: null,
});

/** @experimental This API is unstable and may change without notice. */
export const DetectionSchema = Schema.Union([CurrentDetectionSchema, LegacyDetectionSchema]).pipe(
  Schema.decodeTo(
    Schema.toType(CurrentDetectionSchema),
    SchemaTransformation.transform({
      decode: (detection) =>
        "projectDirs" in detection
          ? {
              project: { markers: detection.projectDirs.map(markerFromLegacyDir) },
              user: { markers: detection.userDirs.map(markerFromLegacyDir) },
            }
          : detection,
      encode: (detection) => detection,
    }),
  ),
  Schema.annotate({
    identifier: "Detection",
    title: "Detection",
    description:
      "Per-scope signals (marker dirs, files, CLI binaries) used to detect an installed agent.",
  }),
);

/** @experimental This API is unstable and may change without notice. */
export type Detection = Schema.Schema.Type<typeof DetectionSchema>;

/** @experimental This API is unstable and may change without notice. */
export const LastVerifiedDateSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.isPattern(ISO_DATE_PATTERN, {
      message: "Expected an ISO 8601 date in YYYY-MM-DD form.",
    }),
  ),
).annotate({
  identifier: "LastVerifiedDate",
  title: "Last Verified Date",
  description: "Date a capability claim was last verified.",
  examples: ["2026-05-16"],
});

/** @experimental This API is unstable and may change without notice. */
export type LastVerifiedDate = Schema.Schema.Type<typeof LastVerifiedDateSchema>;

const CapabilityNotesSchema = Schema.NullOr(Schema.NonEmptyString);
const CapabilityDocsSchema = Schema.Array(DocLinkSchema);
const ActiveSourcesSchema = Schema.NonEmptyArray(UrlSchema);
const InactiveSourcesSchema = Schema.Array(UrlSchema);

const InactiveCapabilitySchema = Schema.Struct({
  lifecycle: InactiveLifecycleSchema,
  notes: CapabilityNotesSchema,
  docs: CapabilityDocsSchema,
  sources: InactiveSourcesSchema,
}).annotate({
  identifier: "InactiveCapability",
  title: "Inactive Capability",
  description: "Capability slot with no active extension support.",
});

const ActiveCapabilityBaseFields = {
  lifecycle: ActiveLifecycleSchema,
  notes: CapabilityNotesSchema,
  docs: CapabilityDocsSchema,
  sources: ActiveSourcesSchema,
  lastVerified: LastVerifiedDateSchema,
  scopes: NonEmptyScopesSchema,
};

const SpecTrackedCapabilityFields = {
  standardsCompliance: StandardsComplianceSchema,
  convention: ConventionSchema,
};

/** @experimental This API is unstable and may change without notice. */
export const CapabilityBaseSchema = Schema.Union([
  Schema.Struct(ActiveCapabilityBaseFields),
  InactiveCapabilitySchema,
]).annotate({
  identifier: "CapabilityBase",
  title: "Capability Base",
  description: "Fields shared by all agent capabilities.",
});

/** @experimental This API is unstable and may change without notice. */
export type CapabilityBase = Schema.Schema.Type<typeof CapabilityBaseSchema>;

/** @experimental This API is unstable and may change without notice. */
export const ScopedCapabilityBaseSchema = Schema.Struct(ActiveCapabilityBaseFields).annotate({
  identifier: "ScopedCapabilityBase",
  title: "Scoped Capability Base",
  description: "Capability fields shared by extension-backed active capabilities.",
});

/** @experimental This API is unstable and may change without notice. */
export type ScopedCapabilityBase = Schema.Schema.Type<typeof ScopedCapabilityBaseSchema>;

const ActiveSpecTrackedCapabilityFields = {
  ...ActiveCapabilityBaseFields,
  ...SpecTrackedCapabilityFields,
};

/** @experimental This API is unstable and may change without notice. */
export const SkillsExtensionCapabilitySchema = Schema.Union([
  Schema.Struct({
    ...ActiveSpecTrackedCapabilityFields,
    directory: Schema.NonEmptyString,
  }),
  InactiveCapabilitySchema,
]).annotate({
  identifier: "SkillsExtensionCapability",
  title: "Skills Capability",
  description: "Agent support for Agent Skills-style extensions.",
});

/** @experimental This API is unstable and may change without notice. */
export type SkillsExtensionCapability = Schema.Schema.Type<typeof SkillsExtensionCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const CommandsExtensionCapabilitySchema = Schema.Union([
  Schema.Struct({
    ...ActiveCapabilityBaseFields,
    directory: Schema.NonEmptyString,
  }),
  InactiveCapabilitySchema,
]).annotate({
  identifier: "CommandsExtensionCapability",
  title: "Commands Capability",
  description: "Agent support for command extensions.",
});

/** @experimental This API is unstable and may change without notice. */
export type CommandsExtensionCapability = Schema.Schema.Type<
  typeof CommandsExtensionCapabilitySchema
>;

/** @experimental This API is unstable and may change without notice. */
export const SubagentsLayoutSchema = Schema.Literals(["file", "directory"]).annotate({
  identifier: "SubagentsLayout",
  title: "Subagents Layout",
  description: "Whether subagents live in a directory or a single opaque file path.",
  examples: ["directory", "file"],
});

/** @experimental This API is unstable and may change without notice. */
export type SubagentsLayout = Schema.Schema.Type<typeof SubagentsLayoutSchema>;

/** @experimental This API is unstable and may change without notice. */
export const SubagentsExtensionCapabilitySchema = Schema.Union([
  Schema.Struct({
    ...ActiveCapabilityBaseFields,
    directory: Schema.NonEmptyString,
    layout: SubagentsLayoutSchema,
  }),
  InactiveCapabilitySchema,
]).annotate({
  identifier: "SubagentsExtensionCapability",
  title: "Subagents Capability",
  description: "Agent support for subagent extensions.",
});

/** @experimental This API is unstable and may change without notice. */
export type SubagentsExtensionCapability = Schema.Schema.Type<
  typeof SubagentsExtensionCapabilitySchema
>;

/** @experimental This API is unstable and may change without notice. */
export const RuleInstructionsKindSchema = Schema.Literals([
  "agents-md",
  "own-file",
  "rules-dir",
]).annotate({
  identifier: "RuleInstructionsKind",
  title: "Rule Instructions Kind",
  description: "Operational instruction-file convention used by the agent.",
  examples: ["agents-md", "own-file", "rules-dir"],
});

/** @experimental This API is unstable and may change without notice. */
export type RuleInstructionsKind = Schema.Schema.Type<typeof RuleInstructionsKindSchema>;

/** @experimental This API is unstable and may change without notice. */
export const RuleInstructionsImportSyntaxSchema = Schema.Literals(["at-path"]).annotate({
  identifier: "RuleInstructionsImportSyntax",
  title: "Rule Instructions Import Syntax",
  description: "Syntax an agent uses to import another instruction file.",
  examples: ["at-path"],
});

/** @experimental This API is unstable and may change without notice. */
export type RuleInstructionsImportSyntax = Schema.Schema.Type<
  typeof RuleInstructionsImportSyntaxSchema
>;

const OptionalRuleDirectoryField = {
  directory: Schema.optionalKey(Schema.NonEmptyString),
};

const AgentsMdRulesExtensionCapabilitySchema = Schema.Struct({
  ...ActiveSpecTrackedCapabilityFields,
  ...OptionalRuleDirectoryField,
  kind: Schema.Literal("agents-md"),
  files: Schema.Tuple([Schema.Literal("AGENTS.md")]),
  nestedDiscovery: Schema.Boolean,
  importSyntax: Schema.NullOr(RuleInstructionsImportSyntaxSchema),
});

const OwnFileRulesExtensionCapabilitySchema = Schema.Struct({
  ...ActiveSpecTrackedCapabilityFields,
  ...OptionalRuleDirectoryField,
  kind: Schema.Literal("own-file"),
  files: Schema.Tuple([Schema.NonEmptyString]),
  nestedDiscovery: Schema.Boolean,
  importSyntax: Schema.NullOr(RuleInstructionsImportSyntaxSchema),
});

const RulesDirRulesExtensionCapabilitySchema = Schema.Struct({
  ...ActiveSpecTrackedCapabilityFields,
  kind: Schema.Literal("rules-dir"),
  files: Schema.Array(Schema.NonEmptyString).pipe(Schema.check(Schema.isUnique())),
  nestedDiscovery: Schema.Boolean,
  importSyntax: Schema.NullOr(RuleInstructionsImportSyntaxSchema),
  directory: Schema.NonEmptyString,
});

/** @experimental This API is unstable and may change without notice. */
export const RulesExtensionCapabilitySchema = Schema.Union([
  AgentsMdRulesExtensionCapabilitySchema,
  OwnFileRulesExtensionCapabilitySchema,
  RulesDirRulesExtensionCapabilitySchema,
  InactiveCapabilitySchema,
]).annotate({
  identifier: "RulesExtensionCapability",
  title: "Rules Capability",
  description: "Agent support for behavior-governing instruction files and rule extensions.",
});

/** @experimental This API is unstable and may change without notice. */
export type RulesExtensionCapability = Schema.Schema.Type<typeof RulesExtensionCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const FilesExtensionCapabilitySchema = Schema.Union([
  Schema.Struct({
    ...ActiveCapabilityBaseFields,
    directory: Schema.NonEmptyString,
    files: Schema.Array(Schema.NonEmptyString).pipe(Schema.check(Schema.isUnique())),
    naming: Schema.NullOr(Schema.NonEmptyString),
  }),
  InactiveCapabilitySchema,
]).annotate({
  identifier: "FilesExtensionCapability",
  title: "Files Capability",
  description: "Agent support for standalone context-file scaffolding.",
});

/** @experimental This API is unstable and may change without notice. */
export type FilesExtensionCapability = Schema.Schema.Type<typeof FilesExtensionCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const ConfigFileFormatSchema = Schema.Literals([
  "json",
  "jsonc",
  "toml",
  "starlark",
  "vscode-settings",
]).annotate({
  identifier: "ConfigFileFormat",
  title: "Config File Format",
  description: "Serialization format used by an agent's permission config file.",
  examples: ["json", "toml", "vscode-settings"],
});

/** @experimental This API is unstable and may change without notice. */
export type ConfigFileFormat = Schema.Schema.Type<typeof ConfigFileFormatSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpServersKeySchema = Schema.Literals([
  "mcpServers",
  "servers",
  "mcp",
  "mcp_servers",
  "context_servers",
]).annotate({
  identifier: "McpServersKey",
  title: "MCP Servers Key",
  description: "Top-level key containing MCP server entries in an agent config file.",
  examples: ["mcpServers", "servers", "mcp"],
});

/** @experimental This API is unstable and may change without notice. */
export type McpServersKey = Schema.Schema.Type<typeof McpServersKeySchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpConfigTargetSchema = Schema.Struct({
  scope: ScopeSchema,
  path: Schema.NonEmptyString,
  format: ConfigFileFormatSchema,
}).annotate({
  identifier: "McpConfigTarget",
  title: "MCP Config Target",
  description: "A config file target where MCP server entries can be written.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpConfigTarget = Schema.Schema.Type<typeof McpConfigTargetSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpTypeFieldValueMapSchema = Schema.Struct({
  "streamable-http": Schema.NonEmptyString,
  sse: Schema.NonEmptyString,
}).annotate({
  identifier: "McpTypeFieldValueMap",
  title: "MCP Type Field Value Map",
  description: "Agent discriminator values by upstream remote transport.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpTypeFieldValueMap = Schema.Schema.Type<typeof McpTypeFieldValueMapSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpTypeFieldSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  value: Schema.Union([Schema.NonEmptyString, McpTypeFieldValueMapSchema]),
}).annotate({
  identifier: "McpTypeField",
  title: "MCP Type Field",
  description: "Optional per-entry transport discriminator field.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpTypeField = Schema.Schema.Type<typeof McpTypeFieldSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpStdioDialectSchema = Schema.Struct({
  typeField: Schema.NullOr(McpTypeFieldSchema),
  command: Schema.Literals(["split", "array"]),
  envKey: Schema.NullOr(Schema.NonEmptyString),
}).annotate({
  identifier: "McpStdioDialect",
  title: "MCP Stdio Dialect",
  description: "How an agent represents local stdio MCP server entries.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpStdioDialect = Schema.Schema.Type<typeof McpStdioDialectSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpUrlKeyMapSchema = Schema.Struct({
  "streamable-http": Schema.NonEmptyString,
  sse: Schema.NonEmptyString,
}).annotate({
  identifier: "McpUrlKeyMap",
  title: "MCP URL Key Map",
  description: "Agent URL field names by upstream remote transport.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpUrlKeyMap = Schema.Schema.Type<typeof McpUrlKeyMapSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpRemoteDialectSchema = Schema.Struct({
  typeField: Schema.NullOr(McpTypeFieldSchema),
  urlKey: McpUrlKeyMapSchema,
  headersKey: Schema.NullOr(Schema.NonEmptyString),
}).annotate({
  identifier: "McpRemoteDialect",
  title: "MCP Remote Dialect",
  description: "How an agent represents remote MCP server entries.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpRemoteDialect = Schema.Schema.Type<typeof McpRemoteDialectSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpConfigSchema = Schema.Struct({
  serversKey: McpServersKeySchema,
  nativeEnabled: Schema.Boolean,
  targets: Schema.Array(McpConfigTargetSchema),
  stdio: Schema.NullOr(McpStdioDialectSchema),
  remote: Schema.NullOr(McpRemoteDialectSchema),
  transform: Schema.NullOr(Schema.NonEmptyString),
}).annotate({
  identifier: "McpConfig",
  title: "MCP Config",
  description: "Prescriptive config writer metadata for an agent's MCP support.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpConfig = Schema.Schema.Type<typeof McpConfigSchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpEnvExpansionSchema = Schema.Struct({
  variables: Schema.Literals(["none", "braced"]),
  defaults: Schema.Boolean,
}).annotate({
  identifier: "McpEnvExpansion",
  title: "MCP Env Expansion",
  description: "Whether an agent expands MCP config environment references.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpEnvExpansion = Schema.Schema.Type<typeof McpEnvExpansionSchema>;

const McpFullCapabilityStruct = Schema.Struct({
  ...ActiveCapabilityBaseFields,
  standardsCompliance: Schema.Literal("full"),
  convention: ConventionSchema,
  transports: NonEmptyMcpTransportsSchema,
  config: McpConfigSchema,
  mcpEnvExpansion: Schema.optionalKey(McpEnvExpansionSchema),
});

const McpFullCapabilitySchema = McpFullCapabilityStruct.pipe(
  Schema.check(
    Schema.makeFilter((capability: Schema.Schema.Type<typeof McpFullCapabilityStruct>) => {
      const issues: Array<Schema.FilterIssue> = [];
      if (capability.transports.includes("stdio") && capability.config.stdio === null) {
        issues.push({
          path: ["config", "stdio"],
          issue: "MCP stdio config is required when stdio transport is supported.",
        });
      }
      if (
        (capability.transports.includes("http") || capability.transports.includes("sse")) &&
        capability.config.remote === null
      ) {
        issues.push({
          path: ["config", "remote"],
          issue: "MCP remote config is required when http or sse transport is supported.",
        });
      }
      return issues;
    }),
  ),
);

const McpNonFullCapabilitySchema = Schema.Struct({
  ...ActiveCapabilityBaseFields,
  standardsCompliance: ActiveMcpNonFullStandardsComplianceSchema,
  convention: ConventionSchema,
  transports: NonEmptyMcpTransportsSchema,
});

/** @experimental This API is unstable and may change without notice. */
export const McpExtensionCapabilitySchema = Schema.Union([
  McpFullCapabilitySchema,
  McpNonFullCapabilitySchema,
  InactiveCapabilitySchema,
]).annotate({
  identifier: "McpExtensionCapability",
  title: "MCP Capability",
  description: "Agent support for MCP server extensions.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpExtensionCapability = Schema.Schema.Type<typeof McpExtensionCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const PermissionMechanismSchema = Schema.Literals([
  "config-file",
  "cli-flag",
  "ui-only",
]).annotate({
  identifier: "PermissionMechanism",
  title: "Permission Mechanism",
  description: "How an agent exposes permission configuration.",
  examples: ["config-file", "cli-flag", "ui-only"],
});

/** @experimental This API is unstable and may change without notice. */
export type PermissionMechanism = Schema.Schema.Type<typeof PermissionMechanismSchema>;

const NonEmptyPermissionMechanismsSchema = Schema.NonEmptyArray(PermissionMechanismSchema).pipe(
  Schema.check(Schema.isUnique()),
);

/** @experimental This API is unstable and may change without notice. */
export const PermissionGrammarStyleSchema = Schema.Literals([
  "tool-call",
  "prefix",
  "regex",
  "glob",
  "starlark-rule",
]).annotate({
  identifier: "PermissionGrammarStyle",
  title: "Permission Grammar Style",
  description: "Syntax shape used to express a permission rule.",
  examples: ["tool-call", "prefix", "regex"],
});

/** @experimental This API is unstable and may change without notice. */
export type PermissionGrammarStyle = Schema.Schema.Type<typeof PermissionGrammarStyleSchema>;

/** @experimental This API is unstable and may change without notice. */
export const ConfigFileLocationSchema = Schema.Struct({
  scope: ScopeSchema,
  path: Schema.NonEmptyString,
  format: ConfigFileFormatSchema,
  gitignored: Schema.Boolean,
}).annotate({
  identifier: "ConfigFileLocation",
  title: "Config File Location",
  description: "A configuration file where an agent's permission rules can live.",
});

/** @experimental This API is unstable and may change without notice. */
export type ConfigFileLocation = Schema.Schema.Type<typeof ConfigFileLocationSchema>;

/** @experimental This API is unstable and may change without notice. */
export const HooksSerializerSchema = Schema.Literals(["claude-code-settings"]).annotate({
  identifier: "HooksSerializer",
  title: "Hooks Serializer",
  description: "Native settings serializer AXM uses for managed hook declarations.",
  examples: ["claude-code-settings"],
});

/** @experimental This API is unstable and may change without notice. */
export type HooksSerializer = Schema.Schema.Type<typeof HooksSerializerSchema>;

/** @experimental This API is unstable and may change without notice. */
export const HooksExtensionCapabilitySchema = Schema.Union([
  Schema.Struct({
    ...ActiveCapabilityBaseFields,
    configFiles: Schema.Array(ConfigFileLocationSchema),
    serializer: HooksSerializerSchema,
  }),
  InactiveCapabilitySchema,
]).annotate({
  identifier: "HooksExtensionCapability",
  title: "Hooks Capability",
  description: "Agent support for lifecycle hook extensions.",
});

/** @experimental This API is unstable and may change without notice. */
export type HooksExtensionCapability = Schema.Schema.Type<typeof HooksExtensionCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const PermissionGrammarSchema = Schema.Struct({
  style: PermissionGrammarStyleSchema,
  example: Schema.NonEmptyString,
  notes: Schema.NullOr(Schema.NonEmptyString),
}).annotate({
  identifier: "PermissionGrammar",
  title: "Permission Grammar",
  description: "Rule syntax used by an agent's permission system.",
});

/** @experimental This API is unstable and may change without notice. */
export type PermissionGrammar = Schema.Schema.Type<typeof PermissionGrammarSchema>;

/** @experimental This API is unstable and may change without notice. */
export const PermissionPrerequisiteSchema = Schema.Struct({
  key: Schema.NonEmptyString,
  value: Schema.NonEmptyString,
  scope: ScopeSchema,
  note: Schema.NullOr(Schema.NonEmptyString),
}).annotate({
  identifier: "PermissionPrerequisite",
  title: "Permission Prerequisite",
  description: "Mode or gate that must be set before allow rules take effect.",
});

/** @experimental This API is unstable and may change without notice. */
export type PermissionPrerequisite = Schema.Schema.Type<typeof PermissionPrerequisiteSchema>;

/** @experimental This API is unstable and may change without notice. */
export const PermissionCliFlagSchema = Schema.Struct({
  flag: Schema.NonEmptyString,
  note: Schema.NullOr(Schema.NonEmptyString),
}).annotate({
  identifier: "PermissionCliFlag",
  title: "Permission CLI Flag",
  description: "Invocation-time flag that adjusts approval or sandbox behavior.",
});

/** @experimental This API is unstable and may change without notice. */
export type PermissionCliFlag = Schema.Schema.Type<typeof PermissionCliFlagSchema>;

const PermissionGrantStruct = Schema.Struct({
  target: Schema.NonEmptyString,
  patch: Schema.NullOr(Schema.Unknown),
  template: Schema.NullOr(Schema.NonEmptyString),
});

/** @experimental This API is unstable and may change without notice. */
export const PermissionGrantSchema = PermissionGrantStruct.pipe(
  Schema.check(
    Schema.makeFilter((grant: Schema.Schema.Type<typeof PermissionGrantStruct>) =>
      grant.patch === null && grant.template === null
        ? "Permission grants require patch or template."
        : undefined,
    ),
  ),
).annotate({
  identifier: "PermissionGrant",
  title: "Permission Grant",
  description:
    "Instruction to grant access for a named tool. Provide patch (JSON-ish merge) or template (raw text). Path and patch may interpolate ${tool} and ${workspaceRoot}.",
});

/** @experimental This API is unstable and may change without notice. */
export type PermissionGrant = Schema.Schema.Type<typeof PermissionGrantSchema>;

/** @experimental This API is unstable and may change without notice. */
export const PermissionsExtensionCapabilitySchema = Schema.Union([
  Schema.Struct({
    ...ActiveCapabilityBaseFields,
    mechanism: NonEmptyPermissionMechanismsSchema,
    configFiles: Schema.Array(ConfigFileLocationSchema),
    grammar: Schema.NullOr(PermissionGrammarSchema),
    prerequisites: Schema.Array(PermissionPrerequisiteSchema),
    cliFlags: Schema.Array(PermissionCliFlagSchema),
    grants: Schema.Record(Schema.String, PermissionGrantSchema),
  }),
  InactiveCapabilitySchema,
]).annotate({
  identifier: "PermissionsExtensionCapability",
  title: "Permissions Capability",
  description: "How an agent grants tool execution and filesystem access without per-call prompts.",
});

/** @experimental This API is unstable and may change without notice. */
export type PermissionsExtensionCapability = Schema.Schema.Type<
  typeof PermissionsExtensionCapabilitySchema
>;

const LeafCapabilitySchemaByType = {
  skill: SkillsExtensionCapabilitySchema,
  command: CommandsExtensionCapabilitySchema,
  "mcp-server": McpExtensionCapabilitySchema,
  subagent: SubagentsExtensionCapabilitySchema,
  files: FilesExtensionCapabilitySchema,
  rule: RulesExtensionCapabilitySchema,
  hook: HooksExtensionCapabilitySchema,
} satisfies Record<LeafExtensionType, Schema.Top>;

/** @experimental This API is unstable and may change without notice. */
export const AgentCapabilitiesSchema = Schema.Struct(LeafCapabilitySchemaByType).annotate({
  identifier: "AgentCapabilities",
  title: "Agent Capabilities",
  description: "Agent extension capabilities keyed by leaf extension type.",
});

/** @experimental This API is unstable and may change without notice. */
export type AgentCapabilities = Schema.Schema.Type<typeof AgentCapabilitiesSchema>;

/** @experimental This API is unstable and may change without notice. */
export type AgentExtensionCapability = AgentCapabilities[LeafExtensionType];

const AgentStruct = Schema.Struct({
  id: AgentIdFromYamlSchema,
  name: Schema.NonEmptyString,
  vendor: Schema.NonEmptyString,
  homepage: UrlSchema,
  interfaces: Schema.NonEmptyArray(AgentInterfaceSchema).pipe(Schema.check(Schema.isUnique())),
  family: Schema.NullOr(Schema.NonEmptyString),
  rootDir: Schema.NullOr(Schema.NonEmptyString),
  detection: DetectionSchema,
  docs: Schema.Array(DocLinkSchema),
  capabilities: AgentCapabilitiesSchema,
  permissions: PermissionsExtensionCapabilitySchema,
});

/** @experimental This API is unstable and may change without notice. */
export const AgentSchema = AgentStruct.pipe(
  Schema.check(
    Schema.makeFilter((agent: Schema.Schema.Type<typeof AgentStruct>) => {
      if (
        "kind" in agent.capabilities.rule &&
        agent.capabilities.rule.kind === "agents-md" &&
        agent.capabilities.rule.files[0] !== "AGENTS.md"
      ) {
        return {
          path: ["capabilities", "rule", "files"],
          issue: 'capabilities.rule.kind "agents-md" requires AGENTS.md.',
        };
      }
      return undefined;
    }),
  ),
).annotate({
  identifier: "Agent",
  title: "Agent",
  description: "AI coding agent and its verified extension capability claims.",
});

/** @experimental This API is unstable and may change without notice. */
export type Agent = Schema.Schema.Type<typeof AgentSchema>;

/** @experimental This API is unstable and may change without notice. */
export const CatalogExtensionTypeSchema = ExtensionTypeSchema;
