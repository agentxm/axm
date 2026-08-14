/**
 * Lint engine — shared-kernel primitives for the AgentXM lint engine.
 *
 * Library-style discriminated unions and a pure evaluator. Rules are plain
 * values generic over a caller-built context; the registry publish gate and
 * `axm lint` each build contexts from their own runtimes and call
 * `evaluateContexts` / `collectFixOperations`.
 *
 * Phase 2 ships the primitives, evaluator, rule-context types, narrow accessor
 * surfaces, `composePath` renderer, schema-delegation helper
 * (`issuesToFindings`), and the `LintConfig` section of `SettingsSchema`.
 *
 * Phases 3a, 3b, 3c land the concrete catalogs (`skillRules`, `packRules`,
 * `workspaceRules`) and register their rule ids via `registerLintRuleIds`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Rule and finding primitives
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

// Evaluator and fix-operation collection
export { evaluateContexts, type Evaluated } from "./evaluate.js";

// Rule-context types and narrow file accessor interfaces
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
  RuleContent,
  RuleFileAccessor,
  RuleRuleContext,
  SubagentContent,
  SubagentFileAccessor,
  SubagentRuleContext,
  PackContent,
  PackFileAccessor,
  PackRuleContext,
  SkillContent,
  SkillFileAccessor,
  SkillRuleContext,
  WorkspaceRuleContext,
  WorkspaceSubject,
} from "./context.js";

// Catalog table — the exhaustive group -> rules / group -> contexts mapping
// the runner drives off.
export {
  CATALOG_GROUP_ORDER,
  LIVE_ONLY_LINT_CATALOGS,
  LINT_CATALOGS,
  REPOSITORY_LINT_CATALOGS,
  emptyCatalogRuleContexts,
  lintCatalogsForView,
  type CatalogContext,
  type CatalogGroup,
  type CatalogRuleContexts,
  type LintView,
} from "./catalog-contexts.js";

// `--json` document schema + derived types
export {
  LintInputSchema,
  LintJsonDocumentSchema,
  LintJsonFindingSchema,
  type LintInput,
  type LintJsonDocument,
  type LintJsonFinding,
} from "./json-schema.js";

// Path rendering
export { composePath } from "./compose-path.js";

// Schema-delegation helper
export { issuesToFindings } from "./issues-to-findings.js";

// Lint config schema + registration
export type { LintConfig, LintRuleSeverity, LintRulesMap } from "./config.js";
export {
  LintConfigSchema,
  LintRuleSeveritySchema,
  LintRulesMapSchema,
  platformCanonicalLintConfig,
  registerLintRuleIds,
  registeredLintRuleIds,
} from "./config.js";

// Lint runner (Phase 5) — reusable primitives the `axm lint` CLI composes
// over. Keeps the CLI command file a thin surface over flag parsing and
// rendering per task 5.11.
export {
  collectRenderedFindings,
  countFindings,
  detectPublishGateDrift,
  evaluateAllCatalogs,
  renderFindingsText,
  resolveLintExitCategory,
  summarizeEvaluations,
  toLintHumanBlocks,
  toLintJsonDocument,
  type FindingCounts,
  type FixSummary,
  type GroupEvaluations,
  type LintHumanBlock,
  type LintHumanDiagnostic,
  type LintHumanReporter,
  type LintExitCategory,
  type LintSummary,
  type RenderFindingsArgs,
  type RenderedFinding,
} from "./cli.js";

// Rule catalogs (Phase 3a lands `skillRules`; Phase 3b lands `packRules`;
// Phase 3c lands `workspaceRules`). Importing this index triggers each
// catalog's module-load `registerLintRuleIds(...)` call so
// `.axm/settings.json` `lint.rules` keys can reference any exported rule id.
export {
  allCatalogRuleIds,
  buildExternalInstalledSkillInfo,
  buildInstalledPackInfo,
  buildLintWorkspace,
  buildNativeInstalledSkillInfo,
  buildPackRuleContexts,
  buildSkillRuleContexts,
  externalSkillDisplayRoot,
  isPerExtensionOperationName,
  makePlatformPackFileAccessor,
  makePlatformSkillFileAccessor,
  makeVftPackFileAccessor,
  makeVftSkillFileAccessor,
  makeVftSkillFileAccessorScoped,
  packRules,
  PER_EXTENSION_OPERATION_NAMES,
  registryNativeSkillDisplayRoot,
  registryPackDisplayRoot,
  skillRules,
  liveOnlyWorkspaceRules,
  repositoryWorkspaceRules,
  workspaceRules,
  type BuildInstalledPackInfoArgs,
  type BuildInstalledSkillInfoExternalArgs,
  type BuildInstalledSkillInfoNativeArgs,
  type BuildLintWorkspaceArgs,
  type InstalledPackInfo,
  type InstalledSkillInfo,
  type LintWorkspace,
  type LintWorkspaceView,
  type PackAccessorPlatform,
  type PackVFTNode,
  type PerExtensionOperationName,
  type SkillAccessorPlatform,
  type VFTNode,
} from "./catalog/index.js";
