/**
 * Agent capability catalog schemas.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { ExtensionTypeSchema } from "../extensions/common.js";
import {
  DocLinkSchema,
  LeafExtensionTypeSchema,
  UrlSchema,
  type LeafExtensionType,
  type Url,
} from "../extension-types/schema.js";

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
export const SUPPORTED_AXM_SUPPORT = "supported" as const;

/** @experimental This API is unstable and may change without notice. */
export const AxmSupportSchema = Schema.Literals([
  SUPPORTED_AXM_SUPPORT,
  "planned",
  "unsupported",
  "unknown",
]).annotate({
  identifier: "AxmSupport",
  title: "AXM Support",
  description: "AXM install behavior and verification state for an agent capability.",
  examples: [SUPPORTED_AXM_SUPPORT, "unsupported", "unknown"],
});

/** @experimental This API is unstable and may change without notice. */
export type AxmSupport = Schema.Schema.Type<typeof AxmSupportSchema>;

/** @experimental This API is unstable and may change without notice. */
export const ActiveAxmSupportSchema = Schema.Literals([SUPPORTED_AXM_SUPPORT, "planned"]).annotate({
  identifier: "ActiveAxmSupport",
  title: "Active AXM Support",
  description: "AXM support values that carry a concrete managed capability claim.",
  examples: [SUPPORTED_AXM_SUPPORT, "planned"],
});

/** @experimental This API is unstable and may change without notice. */
export type ActiveAxmSupport = Schema.Schema.Type<typeof ActiveAxmSupportSchema>;

/** @experimental This API is unstable and may change without notice. */
export const InactiveAxmSupportSchema = Schema.Literals(["unsupported", "unknown"]).annotate({
  identifier: "InactiveAxmSupport",
  title: "Inactive AXM Support",
  description: "AXM support values without an active managed extension writer.",
  examples: ["unsupported", "unknown"],
});

/** @experimental This API is unstable and may change without notice. */
export type InactiveAxmSupport = Schema.Schema.Type<typeof InactiveAxmSupportSchema>;

/** @experimental This API is unstable and may change without notice. */
export const PluginDistributionMechanismSchema = Schema.Literals([
  "agent-native",
  "npm",
  "git",
  "manual",
]).annotate({
  identifier: "PluginDistributionMechanism",
  title: "Plugin Distribution Mechanism",
  description: "How an agent-vendor plugin is distributed outside AXM.",
});

/** @experimental This API is unstable and may change without notice. */
export type PluginDistributionMechanism = Schema.Schema.Type<
  typeof PluginDistributionMechanismSchema
>;

/** @experimental This API is unstable and may change without notice. */
export const PluginDistributionSchema = Schema.Struct({
  mechanism: PluginDistributionMechanismSchema,
  installHint: Schema.NullOr(Schema.NonEmptyString),
  packageRef: Schema.NullOr(Schema.NonEmptyString),
}).annotate({
  identifier: "PluginDistribution",
  title: "Plugin Distribution",
  description: "Descriptive install metadata that AXM may display but never executes.",
});

/** @experimental This API is unstable and may change without notice. */
export type PluginDistribution = Schema.Schema.Type<typeof PluginDistributionSchema>;

/** @experimental This API is unstable and may change without notice. */
export const PluginDetectionPathSchema = Schema.Struct({
  scope: ScopeSchema,
  path: Schema.NonEmptyString,
  kind: Schema.Literals(["dir", "file"]),
}).annotate({
  identifier: "PluginDetectionPath",
  title: "Plugin Detection Path",
  description: "Future scan marker for detecting an installed agent-vendor plugin.",
});

/** @experimental This API is unstable and may change without notice. */
export type PluginDetectionPath = Schema.Schema.Type<typeof PluginDetectionPathSchema>;

/** @experimental This API is unstable and may change without notice. */
export const PluginDetectionConfigKeySchema = Schema.Struct({
  scope: ScopeSchema,
  file: Schema.NonEmptyString,
  key: Schema.NonEmptyString,
}).annotate({
  identifier: "PluginDetectionConfigKey",
  title: "Plugin Detection Config Key",
  description: "Future config-key marker for detecting an installed agent-vendor plugin.",
});

/** @experimental This API is unstable and may change without notice. */
export type PluginDetectionConfigKey = Schema.Schema.Type<typeof PluginDetectionConfigKeySchema>;

/** @experimental This API is unstable and may change without notice. */
export const PluginDetectionSchema = Schema.Struct({
  paths: Schema.Array(PluginDetectionPathSchema),
  configKeys: Schema.Array(PluginDetectionConfigKeySchema),
}).annotate({
  identifier: "PluginDetection",
  title: "Plugin Detection",
  description: "Descriptive plugin detection markers reserved for future workspace scans.",
});

/** @experimental This API is unstable and may change without notice. */
export type PluginDetection = Schema.Schema.Type<typeof PluginDetectionSchema>;

/** @experimental This API is unstable and may change without notice. */
export const PluginDescriptorSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  homepage: UrlSchema,
  author: Schema.NullOr(Schema.NonEmptyString),
  distribution: PluginDistributionSchema,
  detection: Schema.NullOr(PluginDetectionSchema),
}).annotate({
  identifier: "PluginDescriptor",
  title: "Plugin Descriptor",
  description: "Descriptive metadata for third-party or vendor plugins outside AXM management.",
});

/** @experimental This API is unstable and may change without notice. */
export type PluginDescriptor = Schema.Schema.Type<typeof PluginDescriptorSchema>;

/** @experimental This API is unstable and may change without notice. */
const NativeAvailabilitySchema = Schema.Struct({ via: Schema.Literal("native") });
const NoneAvailabilitySchema = Schema.Struct({ via: Schema.Literal("none") });
const PluginAvailabilitySchema = Schema.Struct({
  via: Schema.Literal("plugin"),
  provider: Schema.Literals(["first-party", "third-party"]),
  plugin: PluginDescriptorSchema,
});

const AvailableCapabilityAvailabilitySchema = Schema.Union([
  NativeAvailabilitySchema,
  PluginAvailabilitySchema,
]);

/** @experimental This API is unstable and may change without notice. */
export const AvailabilitySchema = Schema.Union([
  NativeAvailabilitySchema,
  NoneAvailabilitySchema,
  PluginAvailabilitySchema,
]).annotate({
  identifier: "Availability",
  title: "Availability",
  description: "Whether the agent capability surface is obtainable natively, via plugin, or not.",
});

/** @experimental This API is unstable and may change without notice. */
export type Availability = Schema.Schema.Type<typeof AvailabilitySchema>;

const VendorStatusSinceSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.isPattern(ISO_DATE_PATTERN, {
      message: "Expected an ISO 8601 date in YYYY-MM-DD form.",
    }),
  ),
);

const InactiveVendorStatusFields = {
  since: Schema.NullOr(VendorStatusSinceSchema),
  note: Schema.NullOr(Schema.NonEmptyString),
  supersededByType: Schema.NullOr(LeafExtensionTypeSchema),
};

/** @experimental This API is unstable and may change without notice. */
export const VendorStatusSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("active") }),
  Schema.Struct({ state: Schema.Literal("maintenance"), ...InactiveVendorStatusFields }),
  Schema.Struct({ state: Schema.Literal("deprecated"), ...InactiveVendorStatusFields }),
  Schema.Struct({ state: Schema.Literal("removed"), ...InactiveVendorStatusFields }),
]).annotate({
  identifier: "VendorStatus",
  title: "Vendor Status",
  description: "Vendor or plugin health for the surface named by availability.",
});

/** @experimental This API is unstable and may change without notice. */
export type VendorStatus = Schema.Schema.Type<typeof VendorStatusSchema>;

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

const DetectionStruct = Schema.Struct({
  project: ScopeDetectionSchema,
  user: ScopeDetectionSchema,
});

/** @experimental This API is unstable and may change without notice. */
export const DetectionSchema = DetectionStruct.pipe(
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
const CapabilitySourcesSchema = Schema.Array(UrlSchema);

const UnavailableNativeCapabilityFields = {
  availability: NoneAvailabilitySchema,
  vendorStatus: VendorStatusSchema,
  notes: CapabilityNotesSchema,
  docs: CapabilityDocsSchema,
  sources: CapabilitySourcesSchema,
};

const AvailableNativeCapabilityBaseFields = {
  availability: AvailableCapabilityAvailabilitySchema,
  vendorStatus: VendorStatusSchema,
  notes: CapabilityNotesSchema,
  docs: CapabilityDocsSchema,
  sources: CapabilitySourcesSchema,
  scopes: NonEmptyScopesSchema,
};

const SpecTrackedCapabilityFields = {
  standardsCompliance: StandardsComplianceSchema,
  convention: ConventionSchema,
};

const AvailableSpecTrackedNativeCapabilityFields = {
  ...AvailableNativeCapabilityBaseFields,
  ...SpecTrackedCapabilityFields,
};

const NoWriterAxmCapabilityStateSchema = Schema.Union([
  Schema.Struct({
    support: ActiveAxmSupportSchema,
    lastVerified: LastVerifiedDateSchema,
    writer: Schema.Null,
  }),
  Schema.Struct({
    support: InactiveAxmSupportSchema,
    reason: Schema.optionalKey(Schema.NonEmptyString),
    writer: Schema.Null,
  }),
]);

type CapabilityWithActiveSources = {
  readonly native: {
    readonly sources: ReadonlyArray<Url>;
  };
  readonly axm: {
    readonly support: AxmSupport;
  };
};

const requireSourcesForActiveAxmSupport = (
  capability: CapabilityWithActiveSources,
): Schema.FilterIssue | undefined => {
  if (
    (capability.axm.support === SUPPORTED_AXM_SUPPORT || capability.axm.support === "planned") &&
    capability.native.sources.length === 0
  ) {
    return {
      path: ["native", "sources"],
      issue: "Active AXM support claims require at least one native source.",
    };
  }
  return undefined;
};

/** @experimental This API is unstable and may change without notice. */
export const NativeCapabilityBaseSchema = Schema.Union([
  Schema.Struct(AvailableNativeCapabilityBaseFields),
  Schema.Struct(UnavailableNativeCapabilityFields),
]).annotate({
  identifier: "NativeCapabilityBase",
  title: "Native Capability Base",
  description: "Vendor-sourced fields shared by all agent capabilities.",
});

/** @experimental This API is unstable and may change without notice. */
export type NativeCapabilityBase = Schema.Schema.Type<typeof NativeCapabilityBaseSchema>;

/** @experimental This API is unstable and may change without notice. */
export const SkillsExtensionCapabilitySchema = Schema.Struct({
  native: Schema.Union([
    Schema.Struct({
      ...AvailableSpecTrackedNativeCapabilityFields,
      directory: Schema.NonEmptyString,
    }),
    Schema.Struct(UnavailableNativeCapabilityFields),
  ]),
  axm: NoWriterAxmCapabilityStateSchema,
})
  .pipe(Schema.check(Schema.makeFilter(requireSourcesForActiveAxmSupport)))
  .annotate({
    identifier: "SkillsExtensionCapability",
    title: "Skills Capability",
    description: "Agent support for Agent Skills-style extensions.",
  });

/** @experimental This API is unstable and may change without notice. */
export type SkillsExtensionCapability = Schema.Schema.Type<typeof SkillsExtensionCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const CommandsExtensionCapabilitySchema = Schema.Struct({
  native: Schema.Union([
    Schema.Struct({
      ...AvailableNativeCapabilityBaseFields,
      directory: Schema.NonEmptyString,
    }),
    Schema.Struct(UnavailableNativeCapabilityFields),
  ]),
  axm: NoWriterAxmCapabilityStateSchema,
})
  .pipe(Schema.check(Schema.makeFilter(requireSourcesForActiveAxmSupport)))
  .annotate({
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

const PluginSubagentsNativeCapabilitySchema = Schema.Struct({
  ...AvailableNativeCapabilityBaseFields,
  availability: PluginAvailabilitySchema,
});

/** @experimental This API is unstable and may change without notice. */
export const SubagentsExtensionCapabilitySchema = Schema.Struct({
  native: Schema.Union([
    Schema.Struct({
      ...AvailableNativeCapabilityBaseFields,
      availability: NativeAvailabilitySchema,
      directory: Schema.NonEmptyString,
      layout: SubagentsLayoutSchema,
    }),
    PluginSubagentsNativeCapabilitySchema,
    Schema.Struct(UnavailableNativeCapabilityFields),
  ]),
  axm: NoWriterAxmCapabilityStateSchema,
})
  .pipe(Schema.check(Schema.makeFilter(requireSourcesForActiveAxmSupport)))
  .annotate({
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
  ...AvailableSpecTrackedNativeCapabilityFields,
  ...OptionalRuleDirectoryField,
  kind: Schema.Literal("agents-md"),
  files: Schema.Tuple([Schema.Literal("AGENTS.md")]),
  nestedDiscovery: Schema.Boolean,
  importSyntax: Schema.NullOr(RuleInstructionsImportSyntaxSchema),
});

const OwnFileRulesExtensionCapabilitySchema = Schema.Struct({
  ...AvailableSpecTrackedNativeCapabilityFields,
  ...OptionalRuleDirectoryField,
  kind: Schema.Literal("own-file"),
  files: Schema.Tuple([Schema.NonEmptyString]),
  nestedDiscovery: Schema.Boolean,
  importSyntax: Schema.NullOr(RuleInstructionsImportSyntaxSchema),
});

const RulesDirRulesExtensionCapabilitySchema = Schema.Struct({
  ...AvailableSpecTrackedNativeCapabilityFields,
  kind: Schema.Literal("rules-dir"),
  files: Schema.Array(Schema.NonEmptyString).pipe(Schema.check(Schema.isUnique())),
  nestedDiscovery: Schema.Boolean,
  importSyntax: Schema.NullOr(RuleInstructionsImportSyntaxSchema),
  directory: Schema.NonEmptyString,
});

/** @experimental This API is unstable and may change without notice. */
export const RulesExtensionCapabilitySchema = Schema.Struct({
  native: Schema.Union([
    AgentsMdRulesExtensionCapabilitySchema,
    OwnFileRulesExtensionCapabilitySchema,
    RulesDirRulesExtensionCapabilitySchema,
    Schema.Struct(UnavailableNativeCapabilityFields),
  ]),
  axm: NoWriterAxmCapabilityStateSchema,
})
  .pipe(Schema.check(Schema.makeFilter(requireSourcesForActiveAxmSupport)))
  .annotate({
    identifier: "RulesExtensionCapability",
    title: "Rules Capability",
    description: "Agent support for behavior-governing instruction files and rule extensions.",
  });

/** @experimental This API is unstable and may change without notice. */
export type RulesExtensionCapability = Schema.Schema.Type<typeof RulesExtensionCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const FilesExtensionCapabilitySchema = Schema.Struct({
  native: Schema.Union([
    Schema.Struct({
      ...AvailableNativeCapabilityBaseFields,
      directory: Schema.NonEmptyString,
      files: Schema.Array(Schema.NonEmptyString).pipe(Schema.check(Schema.isUnique())),
      naming: Schema.NullOr(Schema.NonEmptyString),
    }),
    Schema.Struct(UnavailableNativeCapabilityFields),
  ]),
  axm: NoWriterAxmCapabilityStateSchema,
})
  .pipe(Schema.check(Schema.makeFilter(requireSourcesForActiveAxmSupport)))
  .annotate({
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
  sse: Schema.optionalKey(Schema.NonEmptyString),
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
  sse: Schema.optionalKey(Schema.NonEmptyString),
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

const McpUnavailableCapabilityStruct = Schema.Struct({
  native: Schema.Struct(UnavailableNativeCapabilityFields),
  axm: Schema.Union([
    Schema.Struct({
      support: ActiveAxmSupportSchema,
      lastVerified: LastVerifiedDateSchema,
      writer: Schema.NullOr(Schema.Struct({ config: McpConfigSchema })),
    }),
    Schema.Struct({
      support: InactiveAxmSupportSchema,
      reason: Schema.optionalKey(Schema.NonEmptyString),
      writer: Schema.NullOr(Schema.Struct({ config: McpConfigSchema })),
    }),
  ]),
});

const McpNativeWithTransportsSchema = Schema.Struct({
  ...AvailableSpecTrackedNativeCapabilityFields,
  transports: NonEmptyMcpTransportsSchema,
  mcpEnvExpansion: Schema.optionalKey(McpEnvExpansionSchema),
});

const McpAvailableCapabilityStruct = Schema.Struct({
  native: McpNativeWithTransportsSchema,
  axm: Schema.Union([
    Schema.Struct({
      support: ActiveAxmSupportSchema,
      lastVerified: LastVerifiedDateSchema,
      writer: Schema.NullOr(Schema.Struct({ config: McpConfigSchema })),
    }),
    Schema.Struct({
      support: InactiveAxmSupportSchema,
      reason: Schema.optionalKey(Schema.NonEmptyString),
      writer: Schema.NullOr(Schema.Struct({ config: McpConfigSchema })),
    }),
  ]),
});

const McpExtensionCapabilityStruct = Schema.Union([
  McpAvailableCapabilityStruct,
  McpUnavailableCapabilityStruct,
]);

const McpExtensionCapabilitySchemaWithChecks = McpExtensionCapabilityStruct.pipe(
  Schema.check(
    Schema.makeFilter((capability: Schema.Schema.Type<typeof McpExtensionCapabilityStruct>) => {
      const issues: Array<Schema.FilterIssue> = [];
      const activeSourcesIssue = requireSourcesForActiveAxmSupport(capability);
      if (activeSourcesIssue !== undefined) issues.push(activeSourcesIssue);
      const writer = capability.axm.writer;
      if (writer === null || !("transports" in capability.native)) return issues;
      const config = writer.config;
      if (capability.native.transports.includes("stdio") && config.stdio === null) {
        issues.push({
          path: ["axm", "writer", "config", "stdio"],
          issue: "MCP stdio config is required when stdio transport is supported.",
        });
      }
      if (
        (capability.native.transports.includes("http") ||
          capability.native.transports.includes("sse")) &&
        config.remote === null
      ) {
        issues.push({
          path: ["axm", "writer", "config", "remote"],
          issue: "MCP remote config is required when http or sse transport is supported.",
        });
      }
      return issues;
    }),
  ),
);

/** @experimental This API is unstable and may change without notice. */
export const McpExtensionCapabilitySchema = McpExtensionCapabilitySchemaWithChecks.annotate({
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
export const CANONICAL_HOOK_EVENT_IDS = [
  "session.start",
  "session.end",
  "prompt.submit",
  "turn.start",
  "turn.end",
  "tool.pre",
  "tool.post",
  "tool.error",
  "subagent.start",
  "subagent.stop",
  "compaction.pre",
  "compaction.post",
  "notification",
  "model.pre",
  "model.post",
  "file.changed",
] as const;

/** @experimental This API is unstable and may change without notice. */
export const CanonicalHookEventIdSchema = Schema.Literals(CANONICAL_HOOK_EVENT_IDS).annotate({
  identifier: "CanonicalHookEventId",
  title: "Canonical Hook Event ID",
  description: "Vendor-neutral hook lifecycle event identifier.",
  examples: ["tool.pre", "tool.post", "prompt.submit"],
});

/** @experimental This API is unstable and may change without notice. */
export type CanonicalHookEventId = Schema.Schema.Type<typeof CanonicalHookEventIdSchema>;

/** @experimental This API is unstable and may change without notice. */
export const HookEventTierSchema = Schema.Literals(["core", "extended"]).annotate({
  identifier: "HookEventTier",
  title: "Hook Event Tier",
  description: "Whether a canonical hook event belongs to the stable core or extended tail.",
});

/** @experimental This API is unstable and may change without notice. */
export type HookEventTier = Schema.Schema.Type<typeof HookEventTierSchema>;

/** @experimental This API is unstable and may change without notice. */
export const CanonicalHookEventSchema = Schema.Struct({
  id: CanonicalHookEventIdSchema,
  tier: HookEventTierSchema,
}).annotate({
  identifier: "CanonicalHookEvent",
  title: "Canonical Hook Event",
  description: "Registered AXM hook event concept.",
});

/** @experimental This API is unstable and may change without notice. */
export type CanonicalHookEvent = Schema.Schema.Type<typeof CanonicalHookEventSchema>;

/** @experimental This API is unstable and may change without notice. */
export const CANONICAL_HOOK_EVENTS = [
  { id: "session.start", tier: "core" },
  { id: "session.end", tier: "core" },
  { id: "prompt.submit", tier: "core" },
  { id: "turn.start", tier: "core" },
  { id: "turn.end", tier: "core" },
  { id: "tool.pre", tier: "core" },
  { id: "tool.post", tier: "core" },
  { id: "tool.error", tier: "core" },
  { id: "subagent.start", tier: "extended" },
  { id: "subagent.stop", tier: "extended" },
  { id: "compaction.pre", tier: "extended" },
  { id: "compaction.post", tier: "extended" },
  { id: "notification", tier: "extended" },
  { id: "model.pre", tier: "extended" },
  { id: "model.post", tier: "extended" },
  { id: "file.changed", tier: "extended" },
] as const satisfies ReadonlyArray<CanonicalHookEvent>;

/** @experimental This API is unstable and may change without notice. */
export const HookMechanismFamilySchema = Schema.Literals([
  "command-stdin",
  "command-env",
  "http",
  "mcp-tool",
  "prompt",
  "subagent",
  "in-process-plugin",
  "declarative-action",
]).annotate({
  identifier: "HookMechanismFamily",
  title: "Hook Mechanism Family",
  description: "How a native hook system invokes a hook.",
  examples: ["command-stdin", "in-process-plugin", "declarative-action"],
});

/** @experimental This API is unstable and may change without notice. */
export type HookMechanismFamily = Schema.Schema.Type<typeof HookMechanismFamilySchema>;

const HookMechanismFamiliesSchema = Schema.Array(HookMechanismFamilySchema).pipe(
  Schema.check(Schema.isUnique()),
);

const NonEmptyHookMechanismFamiliesSchema = Schema.NonEmptyArray(HookMechanismFamilySchema).pipe(
  Schema.check(Schema.isUnique()),
);

/** @experimental This API is unstable and may change without notice. */
export const HookMatcherKindSchema = Schema.Literals([
  "regex",
  "literal-list",
  "glob",
  "tool-category",
  "exact-substring",
  "none-imperative",
]).annotate({
  identifier: "HookMatcherKind",
  title: "Hook Matcher Kind",
  description: "Native matcher syntax used to scope hook invocation.",
  examples: ["regex", "glob", "none-imperative"],
});

/** @experimental This API is unstable and may change without notice. */
export type HookMatcherKind = Schema.Schema.Type<typeof HookMatcherKindSchema>;

const HookMatcherKindsSchema = Schema.Array(HookMatcherKindSchema).pipe(
  Schema.check(Schema.isUnique()),
);

/** @experimental This API is unstable and may change without notice. */
export const HookMatcherSchema = Schema.Struct({
  kind: HookMatcherKindSchema,
  example: Schema.NullOr(Schema.NonEmptyString),
  notes: Schema.NullOr(Schema.NonEmptyString),
}).annotate({
  identifier: "HookMatcher",
  title: "Hook Matcher",
  description: "Matcher model for a native hook event.",
});

/** @experimental This API is unstable and may change without notice. */
export type HookMatcher = Schema.Schema.Type<typeof HookMatcherSchema>;

/** @experimental This API is unstable and may change without notice. */
export const HookBlockOutcomeSchema = Schema.Literals(["allow", "deny", "ask"]).annotate({
  identifier: "HookBlockOutcome",
  title: "Hook Block Outcome",
  description: "Decision outcome available to blocking hook systems.",
});

/** @experimental This API is unstable and may change without notice. */
export type HookBlockOutcome = Schema.Schema.Type<typeof HookBlockOutcomeSchema>;

/** @experimental This API is unstable and may change without notice. */
export const HookModifyOperationSchema = Schema.Literals([
  "modify-input",
  "inject-context",
  "modify-output",
  "synthesize",
  "redact",
]).annotate({
  identifier: "HookModifyOperation",
  title: "Hook Modify Operation",
  description: "Transform operation available to modifying hook systems.",
});

/** @experimental This API is unstable and may change without notice. */
export type HookModifyOperation = Schema.Schema.Type<typeof HookModifyOperationSchema>;

/** @experimental This API is unstable and may change without notice. */
export const HookDecisionCapabilitySchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("observe") }),
  Schema.Struct({
    kind: Schema.Literal("block"),
    outcomes: Schema.NonEmptyArray(HookBlockOutcomeSchema).pipe(Schema.check(Schema.isUnique())),
  }),
  Schema.Struct({
    kind: Schema.Literal("modify"),
    operations: Schema.NonEmptyArray(HookModifyOperationSchema).pipe(
      Schema.check(Schema.isUnique()),
    ),
  }),
]).annotate({
  identifier: "HookDecisionCapability",
  title: "Hook Decision Capability",
  description: "Whether a hook event can observe, block, or modify lifecycle behavior.",
});

/** @experimental This API is unstable and may change without notice. */
export type HookDecisionCapability = Schema.Schema.Type<typeof HookDecisionCapabilitySchema>;

const HookDecisionCapabilitiesSchema = Schema.Array(HookDecisionCapabilitySchema);

/** @experimental This API is unstable and may change without notice. */
export const HookEventMappingSchema = Schema.Struct({
  nativeName: Schema.NonEmptyString,
  canonical: CanonicalHookEventIdSchema,
  matcher: HookMatcherSchema,
  decision: Schema.NonEmptyArray(HookDecisionCapabilitySchema),
  sources: Schema.NonEmptyArray(UrlSchema),
  lastVerified: LastVerifiedDateSchema,
}).annotate({
  identifier: "HookEventMapping",
  title: "Hook Event Mapping",
  description: "Native hook event name with its canonical AXM event pointer and provenance.",
});

/** @experimental This API is unstable and may change without notice. */
export type HookEventMapping = Schema.Schema.Type<typeof HookEventMappingSchema>;

/** @experimental This API is unstable and may change without notice. */
export const HooksCanonicalModelSchema = Schema.Struct({
  events: Schema.Array(CanonicalHookEventIdSchema).pipe(Schema.check(Schema.isUnique())),
  mechanism: HookMechanismFamiliesSchema,
  matcherKinds: HookMatcherKindsSchema,
  decision: HookDecisionCapabilitiesSchema,
}).annotate({
  identifier: "HooksCanonicalModel",
  title: "Hooks Canonical Model",
  description: "Vendor-neutral hook capability projection for an agent.",
});

/** @experimental This API is unstable and may change without notice. */
export type HooksCanonicalModel = Schema.Schema.Type<typeof HooksCanonicalModelSchema>;

/** @experimental This API is unstable and may change without notice. */
export const HooksSerializerSchema = Schema.Literals(["command-stdin"]).annotate({
  identifier: "HooksSerializer",
  title: "Hooks Serializer",
  description: "Native settings serializer AXM uses for managed hook declarations.",
  examples: ["command-stdin"],
});

/** @experimental This API is unstable and may change without notice. */
export type HooksSerializer = Schema.Schema.Type<typeof HooksSerializerSchema>;

/** @experimental This API is unstable and may change without notice. */
export const HookMatcherSerializationSchema = Schema.Literals([
  "bare",
  "slash-delimited",
  "glob",
]).annotate({
  identifier: "HookMatcherSerialization",
  title: "Hook Matcher Serialization",
  description: "How AXM serializes manifest matcher strings into an agent-native hook group.",
  examples: ["bare", "slash-delimited", "glob"],
});

/** @experimental This API is unstable and may change without notice. */
export type HookMatcherSerialization = Schema.Schema.Type<typeof HookMatcherSerializationSchema>;

/** @experimental This API is unstable and may change without notice. */
export const HookTimeoutSerializationSchema = Schema.Literals(["seconds", "milliseconds"]).annotate(
  {
    identifier: "HookTimeoutSerialization",
    title: "Hook Timeout Serialization",
    description: "Unit AXM uses when serializing hook timeout fields into native settings.",
    examples: ["seconds", "milliseconds"],
  },
);

/** @experimental This API is unstable and may change without notice. */
export type HookTimeoutSerialization = Schema.Schema.Type<typeof HookTimeoutSerializationSchema>;

/** @experimental This API is unstable and may change without notice. */
export const HookCommandNameSerializationSchema = Schema.Literals(["omit", "manifest"]).annotate({
  identifier: "HookCommandNameSerialization",
  title: "Hook Command Name Serialization",
  description: "Whether native command hook entries need an explicit name field.",
  examples: ["omit", "manifest"],
});

/** @experimental This API is unstable and may change without notice. */
export type HookCommandNameSerialization = Schema.Schema.Type<
  typeof HookCommandNameSerializationSchema
>;

/** @experimental This API is unstable and may change without notice. */
export const HooksWriterSchema = Schema.Struct({
  serializer: HooksSerializerSchema,
  configFiles: Schema.NonEmptyArray(ConfigFileLocationSchema),
  settingsKey: Schema.NonEmptyString,
  eventMap: Schema.Literal("native.events"),
  matcherKind: HookMatcherKindSchema,
  matcherSerialization: HookMatcherSerializationSchema,
  timeoutSerialization: HookTimeoutSerializationSchema,
  commandNameSerialization: HookCommandNameSerializationSchema,
}).annotate({
  identifier: "HooksWriter",
  title: "Hooks Writer",
  description: "Parameterized AXM hook writer metadata derived from native hook catalog data.",
});

/** @experimental This API is unstable and may change without notice. */
export type HooksWriter = Schema.Schema.Type<typeof HooksWriterSchema>;

const HooksAvailableNativeCapabilitySchema = Schema.Struct({
  ...AvailableNativeCapabilityBaseFields,
  mechanism: NonEmptyHookMechanismFamiliesSchema,
  configFiles: Schema.Array(ConfigFileLocationSchema),
  events: Schema.NonEmptyArray(HookEventMappingSchema),
});

const HooksExtensionCapabilityStruct = Schema.Struct({
  native: Schema.Union([
    HooksAvailableNativeCapabilitySchema,
    Schema.Struct(UnavailableNativeCapabilityFields),
  ]),
  canonical: HooksCanonicalModelSchema,
  axm: Schema.Union([
    Schema.Struct({
      support: ActiveAxmSupportSchema,
      lastVerified: LastVerifiedDateSchema,
      writer: Schema.NullOr(HooksWriterSchema),
    }),
    Schema.Struct({
      support: InactiveAxmSupportSchema,
      reason: Schema.optionalKey(Schema.NonEmptyString),
      writer: Schema.NullOr(HooksWriterSchema),
    }),
  ]),
});

/** @experimental This API is unstable and may change without notice. */
export const HooksExtensionCapabilitySchema = HooksExtensionCapabilityStruct.pipe(
  Schema.check(
    Schema.makeFilter((capability: Schema.Schema.Type<typeof HooksExtensionCapabilityStruct>) => {
      const issues: Array<Schema.FilterIssue> = [];
      const activeSourcesIssue = requireSourcesForActiveAxmSupport(capability);
      if (activeSourcesIssue !== undefined) issues.push(activeSourcesIssue);

      const canonicalEvents = new Set<string>(capability.canonical.events);
      const canonicalMechanisms = new Set<string>(capability.canonical.mechanism);
      const canonicalMatcherKinds = new Set<string>(capability.canonical.matcherKinds);

      if ("events" in capability.native) {
        for (const mechanism of capability.native.mechanism) {
          if (!canonicalMechanisms.has(mechanism)) {
            issues.push({
              path: ["canonical", "mechanism"],
              issue: `Hook canonical mechanism list is missing ${mechanism}.`,
            });
          }
        }
        for (const event of capability.native.events) {
          if (!canonicalEvents.has(event.canonical)) {
            issues.push({
              path: ["canonical", "events"],
              issue: `Hook canonical event list is missing ${event.canonical}.`,
            });
          }
          if (!canonicalMatcherKinds.has(event.matcher.kind)) {
            issues.push({
              path: ["canonical", "matcherKinds"],
              issue: `Hook canonical matcher list is missing ${event.matcher.kind}.`,
            });
          }
        }
      }

      return issues;
    }),
  ),
).annotate({
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
export const PermissionsExtensionCapabilitySchema = Schema.Struct({
  native: Schema.Union([
    Schema.Struct({
      ...AvailableNativeCapabilityBaseFields,
      mechanism: NonEmptyPermissionMechanismsSchema,
      configFiles: Schema.Array(ConfigFileLocationSchema),
      grammar: Schema.NullOr(PermissionGrammarSchema),
      prerequisites: Schema.Array(PermissionPrerequisiteSchema),
      cliFlags: Schema.Array(PermissionCliFlagSchema),
    }),
    Schema.Struct(UnavailableNativeCapabilityFields),
  ]),
  axm: Schema.Union([
    Schema.Struct({
      support: ActiveAxmSupportSchema,
      lastVerified: LastVerifiedDateSchema,
      writer: Schema.NullOr(
        Schema.Struct({ grants: Schema.Record(Schema.String, PermissionGrantSchema) }),
      ),
    }),
    Schema.Struct({
      support: InactiveAxmSupportSchema,
      reason: Schema.optionalKey(Schema.NonEmptyString),
      writer: Schema.NullOr(
        Schema.Struct({ grants: Schema.Record(Schema.String, PermissionGrantSchema) }),
      ),
    }),
  ]),
})
  .pipe(Schema.check(Schema.makeFilter(requireSourcesForActiveAxmSupport)))
  .annotate({
    identifier: "PermissionsExtensionCapability",
    title: "Permissions Capability",
    description:
      "How an agent grants tool execution and filesystem access without per-call prompts.",
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

/** @experimental This API is unstable and may change without notice. */
export type NativeCapability = AgentExtensionCapability["native"];

/** @experimental This API is unstable and may change without notice. */
export type AxmCapabilityState = AgentExtensionCapability["axm"];

/** @experimental This API is unstable and may change without notice. */
export const AgentLifecycleStateSchema = Schema.Literals([
  "active",
  "deprecated",
  "retired",
]).annotate({
  identifier: "AgentLifecycleState",
  title: "Agent Lifecycle State",
  description:
    "Support status of the coding agent product itself. Distinct from AxmSupport, which tracks AXM's integration with a single capability.",
  examples: ["active", "deprecated", "retired"],
});

/** @experimental This API is unstable and may change without notice. */
export type AgentLifecycleState = Schema.Schema.Type<typeof AgentLifecycleStateSchema>;

const AgentLifecycleSinceSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.isPattern(ISO_DATE_PATTERN, {
      message: "Expected an ISO 8601 date in YYYY-MM-DD form.",
    }),
  ),
).annotate({
  identifier: "AgentLifecycleSince",
  title: "Agent Lifecycle Since",
  description: "Date an agent entered its current lifecycle state.",
  examples: ["2025-11-01"],
});

// Loose kebab id rather than the closed AgentIdSchema: that schema lives in
// catalog.ts (which imports this module), so referencing it here would be a
// cycle. Referential integrity (target exists, not self, no cycles) is enforced
// by the catalog invariant test.
const InactiveAgentLifecycleFields = {
  since: Schema.NullOr(AgentLifecycleSinceSchema),
  note: Schema.NullOr(Schema.NonEmptyString),
  supersededBy: Schema.NullOr(AgentIdFromYamlSchema),
};

/** @experimental This API is unstable and may change without notice. */
export const AgentLifecycleSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal("active") }),
  Schema.Struct({ state: Schema.Literal("deprecated"), ...InactiveAgentLifecycleFields }),
  Schema.Struct({ state: Schema.Literal("retired"), ...InactiveAgentLifecycleFields }),
]).annotate({
  identifier: "AgentLifecycle",
  title: "Agent Lifecycle",
  description:
    "Whether a catalog agent is active, deprecated, or retired, and which agent supersedes it.",
});

/** @experimental This API is unstable and may change without notice. */
export type AgentLifecycle = Schema.Schema.Type<typeof AgentLifecycleSchema>;

const AgentStruct = Schema.Struct({
  id: AgentIdFromYamlSchema,
  name: Schema.NonEmptyString,
  vendor: Schema.NonEmptyString,
  homepage: UrlSchema,
  interfaces: Schema.NonEmptyArray(AgentInterfaceSchema).pipe(Schema.check(Schema.isUnique())),
  family: Schema.NullOr(Schema.NonEmptyString),
  rootDir: Schema.NullOr(Schema.NonEmptyString),
  lifecycle: AgentLifecycleSchema,
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
        "kind" in agent.capabilities.rule.native &&
        agent.capabilities.rule.native.kind === "agents-md" &&
        agent.capabilities.rule.native.files[0] !== "AGENTS.md"
      ) {
        return {
          path: ["capabilities", "rule", "canonical", "files"],
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
