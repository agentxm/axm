/**
 * Workspace-inspection feature: read-only assessment of the workspace's
 * extension inventory against registries and sources (listing and
 * version-currency checks).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  ExtensionNotInstalled,
  PackInspectionRefused,
  PublishedMetadataUnavailable,
  WorkspaceInspectionFailed,
} from "./errors.js";

export {
  assessExtensionListItems,
  collectExtensionListItems,
  type ExtensionAssessment,
  type ExtensionAssessmentState,
  type ExtensionListFilter,
  type ExtensionListItem,
} from "./extension-list/assessment.js";

export {
  checkCurrency,
  collectAllCurrencyEntries,
  collectAllUpdateEntries,
  collectHookCurrency,
  collectKnowledgeCurrency,
  collectMcpServerCurrency,
  collectPackCurrency,
  collectRuleCurrency,
  collectSkillCurrency,
  collectSkillSourceFreshness,
  collectMcpServerSourceFreshness,
  collectSubagentSourceFreshness,
  collectRuleSourceFreshness,
  collectHookSourceFreshness,
  collectKnowledgeSourceFreshness,
  sourceFreshnessCollectors,
  collectSubagentCurrency,
  type CurrencyResult,
  type CurrencyStatus,
  type ExtensionCurrencyEntry,
  type ExtensionSourceFreshnessEntry,
  type ExtensionUpdateEntry,
} from "./version-currency/index.js";

// Read-only application APIs.
export {
  ExtensionListDocumentSchema,
  ListExtensions,
  type ExtensionListDocument,
  type ListExtensionsRequest,
  type ListExtensionsResult,
} from "./extension-list/list-extensions.js";
export {
  listHooks,
  listMcpServers,
  listPacks,
  listRules,
  listSkills,
  listSubagents,
  type PackListRow,
  type SkillListRow,
  type SourcedListRow,
  type TypeListResult,
  type TypeListRow,
} from "./type-list/type-lists.js";
export {
  mcpServerListDocument,
  McpServerListQueryResultSchema,
  type McpServerListQueryResult,
  type McpServerListRow,
} from "./type-list/mcp-servers.js";
export {
  EXTENSION_SHOW_ITEM_FIELDS,
  ExtensionShowResultSchema,
  ShowExtension,
  type ExtensionShowResult,
  type ShowExtensionRequest,
} from "./show/show-extension.js";
export {
  PackShowResultSchema,
  ShowPack,
  type PackShowResult,
  type ShowPackRequest,
} from "./packs/show-pack.js";
export {
  defaultViewRegistry,
  resolveViewHandle,
  resolveViewRegistry,
  VIEW_FIELDS,
  ViewDocumentSchema,
  ViewExtension,
  ViewFieldValueSchema,
  type ReadPublishedExtensionRequest,
  type ViewDocument,
  type ViewExtensionResult,
  type ViewField,
  type ViewFieldValue,
  type ViewTargetRegistry,
} from "./view/view-extension.js";
export {
  KnowledgeListQueryResultSchema,
  ListKnowledge,
  type KnowledgeListQueryResult,
  type KnowledgeListRow,
} from "./knowledge/list-knowledge.js";
