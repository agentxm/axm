/**
 * Lint vocabulary, configuration, evaluation, and the per-type rule catalog.
 *
 * The publish gate and `axm lint` run the same catalog arrays; only the
 * Knowledge catalog differs, because diagnostic rules need an OKF inspection
 * that the publish gate obtains through package validation instead
 * (`publishKnowledgeRules`).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export type {
  AdvisoryFinding,
  AdvisoryRule,
  FindingBase,
  FindingLocation,
  LintFinding,
  LintRule,
  RuleBase,
  Severity,
} from "./rule.js";
export type {
  FileAccessError,
  HookContent,
  HookFileAccessor,
  HookRuleContext,
  KnowledgeContent,
  KnowledgeFileAccessor,
  KnowledgeRuleContext,
  McpServerContent,
  McpServerFileAccessor,
  McpServerRuleContext,
  PackContent,
  PackFileAccessor,
  PackRuleContext,
  RuleContent,
  RuleFileAccessor,
  RuleRuleContext,
  SkillContent,
  SkillFileAccessor,
  SkillRuleContext,
  SubagentContent,
  SubagentFileAccessor,
  SubagentRuleContext,
} from "./context.js";
export {
  type LintConfig,
  LintConfigSchema,
  type LintRuleSeverity,
  LintRuleSeveritySchema,
  type LintRulesMap,
  LintRulesMapSchema,
  platformCanonicalLintConfig,
} from "./config.js";
export {
  type LintCatalogGroup,
  type LintCatalogRuleMetadata,
  type LintCatalogView,
  allLintCatalogRuleIds,
  lintCatalogRuleMetadata,
} from "./catalog-metadata.js";
export { type Evaluated, evaluateContexts } from "./evaluate.js";
export { composePath } from "./compose-path.js";
export { issuesToFindings } from "./issues-to-findings.js";
export { UNKNOWN_DOCUMENT_LABEL, describeSchemaDocument } from "./describe-document.js";
export { skillRules } from "./catalog/skill.js";
export { packRules } from "./catalog/pack.js";
export { subagentRules } from "./catalog/subagent.js";
export { mcpServerRules } from "./catalog/mcp-server.js";
export { hookRules } from "./catalog/hook.js";
export { ruleRules } from "./catalog/rule.js";
export {
  knowledgeDiagnosticRuleDefinitions,
  knowledgeDiagnosticRules,
  knowledgeRules,
  publishKnowledgeRules,
} from "./catalog/knowledge.js";
export {
  type InstalledSkillInfo,
  buildSkillRuleContexts,
} from "./catalog/skill-accessor/contexts.js";
export {
  type VFTNode,
  makeVftSkillFileAccessor,
  makeVftSkillFileAccessorScoped,
} from "./catalog/skill-accessor/vft.js";
export { type InstalledPackInfo, buildPackRuleContexts } from "./catalog/pack-accessor/contexts.js";
export { type PackVFTNode, makeVftPackFileAccessor } from "./catalog/pack-accessor/vft.js";
export {
  type ManifestJsonParseFailure,
  isManifestJsonParseFailure,
  makeManifestJsonParseFailure,
  manifestJsonParseFailureToFinding,
} from "./catalog/shared/manifest-json.js";
export {
  type ManifestEnvelopeOptions,
  type ManifestEnvelopeRules,
  type ManifestEnvelopeSchema,
  makeManifestEnvelopeRules,
  orderedEnvelopeRules,
} from "./catalog/shared/envelope-rules.js";
export { schemaDecodeFindings } from "./catalog/shared/schema-rule.js";
