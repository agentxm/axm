/**
 * Agent capability catalog schemas.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { ExtensionTypeSchema } from "../extensions/common.js";

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
  identifier: "AgentIdFromYaml",
  title: "Agent ID",
  description: "Lowercase kebab-case coding agent identifier.",
  examples: ["claude-code", "codex", "cursor"],
});

/** @experimental This API is unstable and may change without notice. */
export type AgentIdFromYaml = Schema.Schema.Type<typeof AgentIdFromYamlSchema>;

/** @experimental This API is unstable and may change without notice. */
export const SupportLevelSchema = Schema.Literals([
  "standard",
  "bridged",
  "planned",
  "unsupported",
  "unknown",
]).annotate({
  identifier: "SupportLevel",
  title: "Support Level",
  description: "How an agent supports a capability.",
  examples: ["standard", "bridged", "unknown"],
});

/** @experimental This API is unstable and may change without notice. */
export type SupportLevel = Schema.Schema.Type<typeof SupportLevelSchema>;

/** @experimental This API is unstable and may change without notice. */
export const ScopeSchema = Schema.Literals(["user", "project"]).annotate({
  identifier: "Scope",
  title: "Scope",
  description: "Where a capability can be configured.",
  examples: ["user", "project"],
});

/** @experimental This API is unstable and may change without notice. */
export type Scope = Schema.Schema.Type<typeof ScopeSchema>;

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

/** @experimental This API is unstable and may change without notice. */
export const StandardSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  url: Schema.NonEmptyString,
}).annotate({
  identifier: "Standard",
  title: "Standard",
  description: "Open standard referenced by a capability kind.",
});

/** @experimental This API is unstable and may change without notice. */
export type Standard = Schema.Schema.Type<typeof StandardSchema>;

/** @experimental This API is unstable and may change without notice. */
export const DocLinkSchema = Schema.Struct({
  label: Schema.NonEmptyString,
  url: Schema.NonEmptyString,
}).annotate({
  identifier: "DocLink",
  title: "Documentation Link",
  description: "Documentation reference for an agent or capability.",
});

/** @experimental This API is unstable and may change without notice. */
export type DocLink = Schema.Schema.Type<typeof DocLinkSchema>;

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

const CapabilityBaseFields = {
  support: SupportLevelSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "support level is required" }),
  ),
  notes: Schema.optional(Schema.NonEmptyString),
  docs: Schema.optional(Schema.Array(DocLinkSchema)),
  sources: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  lastVerified: Schema.optional(LastVerifiedDateSchema),
};

/** @experimental This API is unstable and may change without notice. */
export const CapabilityBaseSchema = Schema.Struct(CapabilityBaseFields).annotate({
  identifier: "CapabilityBase",
  title: "Capability Base",
  description: "Fields shared by all agent capabilities.",
});

/** @experimental This API is unstable and may change without notice. */
export type CapabilityBase = Schema.Schema.Type<typeof CapabilityBaseSchema>;

const ScopedCapabilityBaseFields = {
  ...CapabilityBaseFields,
  scopes: Schema.Array(ScopeSchema).pipe(
    Schema.annotateKey({ messageMissingKey: "capability scopes are required" }),
    Schema.check(Schema.isUnique()),
  ),
};

/** @experimental This API is unstable and may change without notice. */
export const ScopedCapabilityBaseSchema = Schema.Struct(ScopedCapabilityBaseFields).annotate({
  identifier: "ScopedCapabilityBase",
  title: "Scoped Capability Base",
  description: "Capability fields shared by extension-backed capabilities.",
});

/** @experimental This API is unstable and may change without notice. */
export type ScopedCapabilityBase = Schema.Schema.Type<typeof ScopedCapabilityBaseSchema>;

/** @experimental This API is unstable and may change without notice. */
export const SkillsCapabilitySchema = Schema.Struct({
  ...ScopedCapabilityBaseFields,
  directory: Schema.optional(Schema.NonEmptyString),
}).annotate({
  identifier: "SkillsCapability",
  title: "Skills Capability",
  description: "Agent support for Agent Skills-style extensions.",
});

/** @experimental This API is unstable and may change without notice. */
export type SkillsCapability = Schema.Schema.Type<typeof SkillsCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const CommandsCapabilitySchema = Schema.Struct({
  ...ScopedCapabilityBaseFields,
  directory: Schema.optional(Schema.NonEmptyString),
}).annotate({
  identifier: "CommandsCapability",
  title: "Commands Capability",
  description: "Agent support for command extensions.",
});

/** @experimental This API is unstable and may change without notice. */
export type CommandsCapability = Schema.Schema.Type<typeof CommandsCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const McpCapabilitySchema = Schema.Struct({
  ...ScopedCapabilityBaseFields,
  transports: Schema.Array(McpTransportSchema).pipe(
    Schema.annotateKey({ messageMissingKey: "MCP transports are required" }),
    Schema.check(Schema.isUnique()),
  ),
}).annotate({
  identifier: "McpCapability",
  title: "MCP Capability",
  description: "Agent support for MCP server extensions.",
});

/** @experimental This API is unstable and may change without notice. */
export type McpCapability = Schema.Schema.Type<typeof McpCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const SubagentsCapabilitySchema = Schema.Struct(ScopedCapabilityBaseFields).annotate({
  identifier: "SubagentsCapability",
  title: "Subagents Capability",
  description: "Agent support for subagent extensions.",
});

/** @experimental This API is unstable and may change without notice. */
export type SubagentsCapability = Schema.Schema.Type<typeof SubagentsCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const InstructionsCapabilitySchema = Schema.Struct({
  ...ScopedCapabilityBaseFields,
  files: Schema.Array(Schema.NonEmptyString).pipe(
    Schema.annotateKey({ messageMissingKey: "instruction files are required" }),
    Schema.check(Schema.isUnique()),
  ),
  nestedDiscovery: Schema.optional(Schema.Boolean),
}).annotate({
  identifier: "InstructionsCapability",
  title: "Instructions Capability",
  description: "Agent support for plain prose instruction files.",
});

/** @experimental This API is unstable and may change without notice. */
export type InstructionsCapability = Schema.Schema.Type<typeof InstructionsCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export const RulesCapabilitySchema = Schema.Struct({
  ...ScopedCapabilityBaseFields,
  directory: Schema.optional(Schema.NonEmptyString),
}).annotate({
  identifier: "RulesCapability",
  title: "Rules Capability",
  description: "Agent support for structured rule files.",
});

/** @experimental This API is unstable and may change without notice. */
export type RulesCapability = Schema.Schema.Type<typeof RulesCapabilitySchema>;

/** @experimental This API is unstable and may change without notice. */
export type AgentCapability =
  | SkillsCapability
  | CommandsCapability
  | McpCapability
  | SubagentsCapability
  | InstructionsCapability
  | RulesCapability;

/** @experimental This API is unstable and may change without notice. */
export const AgentSchema = Schema.Struct({
  id: AgentIdFromYamlSchema.pipe(Schema.annotateKey({ messageMissingKey: "agent id is required" })),
  name: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "agent name is required" }),
  ),
  vendor: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "agent vendor is required" }),
  ),
  homepage: Schema.NonEmptyString.pipe(
    Schema.annotateKey({ messageMissingKey: "agent homepage is required" }),
  ),
  interfaces: Schema.Array(AgentInterfaceSchema).pipe(
    Schema.annotateKey({ messageMissingKey: "agent interfaces are required" }),
    Schema.check(Schema.isUnique()),
  ),
  family: Schema.optional(Schema.NonEmptyString),
  docs: Schema.optional(Schema.Array(DocLinkSchema)),
  skills: Schema.optional(SkillsCapabilitySchema),
  commands: Schema.optional(CommandsCapabilitySchema),
  mcp: Schema.optional(McpCapabilitySchema),
  subagents: Schema.optional(SubagentsCapabilitySchema),
  instructions: Schema.optional(InstructionsCapabilitySchema),
  rules: Schema.optional(RulesCapabilitySchema),
}).annotate({
  identifier: "Agent",
  title: "Agent",
  description: "AI coding agent and its verified extension capability claims.",
});

/** @experimental This API is unstable and may change without notice. */
export type Agent = Schema.Schema.Type<typeof AgentSchema>;

/** @experimental This API is unstable and may change without notice. */
export const CatalogExtensionTypeSchema = ExtensionTypeSchema;
