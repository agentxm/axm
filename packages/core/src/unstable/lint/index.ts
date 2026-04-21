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
  AutofixableFinding,
  AutofixingRule,
  FindingBase,
  FindingLocation,
  LintFinding,
  LintRule,
  RuleBase,
  Severity,
} from "./rule.js";

// Evaluator and fix-operation collection
export { collectFixOperations, evaluateContexts, type Evaluated } from "./evaluate.js";

// Rule-context types and narrow accessor interfaces
export type {
  AgentDetection,
  FileAccessError,
  LockfileDocument,
  LockfileReadError,
  PackContent,
  PackFileAccessor,
  PackRuleContext,
  SettingsDocument,
  SettingsReadError,
  SkillContent,
  SkillFileAccessor,
  SkillRuleContext,
  WorkspaceLintAccessor,
  WorkspaceRuleContext,
  WorkspaceSubject,
} from "./context.js";

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

// Rule catalogs (Phase 3a lands `skillRules`; Phases 3b/3c append to this
// barrel). Importing this index triggers each catalog's module-load
// `registerLintRuleIds(...)` call so `.axm/settings.json` `lint.rules` keys
// can reference any exported rule id.
export {
  allCatalogRuleIds,
  buildSkillRuleContexts,
  makePlatformSkillFileAccessor,
  makeVftSkillFileAccessor,
  skillRules,
  type InstalledSkillInfo,
  type SkillAccessorPlatform,
  type SkillIndexView,
  type VFTNode,
} from "./catalog/index.js";
