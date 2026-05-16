/**
 * Agent capability catalog for @agentxm/client-core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  AgentIdFromYamlSchema,
  AgentInterfaceSchema,
  AgentSchema,
  CapabilityBaseSchema,
  CatalogExtensionTypeSchema,
  CommandsCapabilitySchema,
  DocLinkSchema,
  InstructionsCapabilitySchema,
  LastVerifiedDateSchema,
  McpCapabilitySchema,
  McpTransportSchema,
  RulesCapabilitySchema,
  ScopeSchema,
  ScopedCapabilityBaseSchema,
  SkillsCapabilitySchema,
  StandardSchema,
  SubagentsCapabilitySchema,
  SupportLevelSchema,
  type Agent,
  type AgentCapability,
  type AgentIdFromYaml,
  type AgentInterface,
  type CapabilityBase,
  type CommandsCapability,
  type DocLink,
  type InstructionsCapability,
  type LastVerifiedDate,
  type McpCapability,
  type McpTransport,
  type RulesCapability,
  type Scope,
  type ScopedCapabilityBase,
  type SkillsCapability,
  type Standard,
  type SubagentsCapability,
  type SupportLevel,
} from "./schema.js";
export { STANDARDS } from "./standards.js";
export {
  EXTENSION_TYPE_CAPABILITY,
  LEAF_EXTENSION_TYPES,
  SUPPORT_LEVELS_THAT_WORK,
  agentSupportsType,
  capabilityKinds,
  isLeafExtensionType,
  listCapabilities,
  supportedTypes,
  supportLevelWorks,
  worksOn,
  worksOnAll,
  worksOnExtension,
  type CapabilityKind,
  type CapabilityListing,
  type ExtensionCompatibilityInput,
  type LeafExtensionType,
} from "./derive.js";
export {
  validateCatalogSources,
  type CatalogSource,
  type CatalogValidationIssue,
} from "./validate.js";
export {
  AGENTS,
  AGENTS_BY_ID,
  AGENT_IDS,
  AgentIdSchema,
  type AgentId,
} from "./catalog.generated.js";
export { agentById } from "./lookup.js";
