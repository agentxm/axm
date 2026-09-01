/**
 * Workspace-inspection feature: read-only assessment of the workspace's
 * extension inventory against registries and sources (listing and
 * version-currency checks).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  assessExtensionListItems,
  collectExtensionListItems,
  type ExtensionAssessment,
  type ExtensionAssessmentState,
  type ExtensionListFilter,
  type ExtensionListItem,
} from "./extension-list.js";

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
