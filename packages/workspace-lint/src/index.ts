// Rule-context types and narrow file accessor interfaces
export type { WorkspaceRuleContext, WorkspaceSubject } from "./workspace-context.js";

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
export { findingsForProjectionFacts } from "./catalog/workspace/projections-current.js";

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
// `axm.json` `lint.rules` keys can reference any exported rule id.
export {
  allCatalogErrorRuleIds,
  allCatalogRuleIds,
  buildAcquiredInstalledSkillInfo,
  buildInstalledPackInfo,
  buildLintWorkspace,
  buildNativeInstalledSkillInfo,
  acquiredSkillDisplayRoot,
  registryNativeSkillDisplayRoot,
  registryPackDisplayRoot,
  liveOnlyWorkspaceRules,
  repositoryWorkspaceRules,
  workspaceRules,
  type BuildInstalledPackInfoArgs,
  type BuildAcquiredInstalledSkillInfoArgs,
  type BuildInstalledSkillInfoNativeArgs,
  type BuildLintWorkspaceArgs,
  type LintWorkspace,
  type LintWorkspaceView,
} from "./catalog/index.js";

// Lint-run policy: root resolution, settings-derived configuration,
// determined repairs, staged Git-index input, and path remapping.
export { LintStagingFailed } from "./run/errors.js";
export {
  isolatedGitEnvironment,
  materializeGitIndexWorkspace,
  type StagedWorkspace,
} from "./run/staged-workspace.js";
export {
  applyDeterminedRepairs,
  lintConfigFromSettings,
  loadSettingsDocument,
  remapLintSummaryPaths,
  resolveLintRoot,
  type PathRemapper,
} from "./run/settings.js";
