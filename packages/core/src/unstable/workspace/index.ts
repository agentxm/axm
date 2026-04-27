/**
 * Workspace module - plan-based orchestration for extension management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan pipeline primitives (`Plan`, `applyPlan`, `previewOrApplyPlan`, and
// `OperationHandler`) moved to `@agentxm/client-core/unstable/plan`. Consumers
// import them from there directly.

// Scope utilities
export { WORKSPACE_SCOPES, DEFAULT_WORKSPACE_SCOPE, type WorkspaceScope } from "./scope.js";

// Classifier records
export {
  toClassifiedCommandRecord,
  toClassifiedExtensionRefRecord,
  toClassifiedSkillRecord,
  toConfiguredCommandRecord,
  toConfiguredExternalCommandRecord,
  toConfiguredExternalExtensionRefRecord,
  toConfiguredExternalSkillRecord,
  toConfiguredExtensionRefRecord,
  toConfiguredSkillRecord,
  toImplicitCommandRecord,
  toImplicitExtensionRefRecord,
  toImplicitSkillRecord,
  toInstalledCommandRecord,
  toInstalledExtensionRefRecord,
  toInstalledSkillRecord,
  toUnmanagedCommandRecord,
  toUnmanagedExternalCommandRecord,
  toUnmanagedExternalExtensionRefRecord,
  toUnmanagedExternalSkillRecord,
  toUnmanagedExtensionRefRecord,
  toUnmanagedSkillRecord,
} from "./classifier-records.js";

// Taxonomy types
export type {
  ClassifiedCommand,
  ClassifiedExtension,
  ClassifiedExtensionRef,
  ClassifiedSkill,
  ClassifiedSubagent,
  ConfiguredCommand,
  ConfiguredExtensionRef,
  ConfiguredSkill,
  ConfiguredSubagent,
  ImplicitCommand,
  ImplicitExtensionRef,
  ImplicitSkill,
  ImplicitSubagent,
  InstalledCommand,
  InstalledExtensionRef,
  InstalledSkill,
  InstalledSubagent,
  PackagingKind,
  UnmanagedCommand,
  UnmanagedExtensionRef,
  UnmanagedSkill,
} from "./taxonomy-types.js";

// Reconciliation
export {
  buildReconciliationSnapshot,
  dedupeDeclarations,
  ReconciliationAdapters,
  runReadRecoverOperation,
  runReconcileMaterializeOperation,
  type ReconciliationSnapshot,
} from "./reconciliation.js";

// Configured entry resolution
export {
  resolveConfiguredCommand,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  type ConfiguredEntryFailureReason,
  type ResolvedConfiguredCommand,
  type ResolvedConfiguredEntry,
  type ResolvedConfiguredMcpServer,
  type ResolvedConfiguredPack,
  type ResolvedConfiguredSkill,
  type ResolvedConfiguredSubagent,
} from "./configured-entry-resolution/index.js";

// Reconciliation types
export type {
  AdapterEnvironment,
  DeclarationResolution,
  DeclarationScanResult,
  ReconcileExtensionType,
  ReconciliationAdapter,
  ReconciliationContext,
  ReconciliationDeclaration,
  ReconstructedLockEntry,
  UnresolvedReason,
} from "./reconciliation-types.js";

// Source metadata
export { deriveSourceMetaFromLockType, type SourceMeta } from "./source-metadata.js";

// Scan plan readiness
export { scanPlanReadiness, type PlanReadinessReport } from "./scan-plan-readiness.js";

// Workspace read model
export {
  WorkspaceContext,
  WorkspaceContextConfigTag,
  WorkspaceContextLive,
  type RawSourceBytes,
  type ScopedProfileApi,
  type ScopedSourceHostsApi,
  type ScopedStateApi,
  type ScopedWorkspaceContext,
  type WorkspaceContextConfig,
} from "./context/context.js";
export {
  getPriorityDirectories,
  parsePluginManifests,
  scanAgentSubagentFiles,
  scanAllSubagentFiles,
  skillsInDir,
  type AgentSubagentSummary,
  type DetectedSubagentFile,
  type DiscoveredSkill,
  type DiscoveryOptions,
} from "./context/discovery/index.js";

// Augment plan
export {
  augmentPlanWithReconciliation,
  type AugmentedPlanResult,
  type DegradedLockfileState,
  type LockfileState,
} from "./augment-plan.js";

// Workspace service tag and interface
export {
  Workspace,
  type WorkspaceContextService,
  type WorkspaceContextError,
  type WorkspaceContextOptions,
  type SetSkillArgs,
  type SetExtensionPackArgs,
  type SetCommandArgs,
  type SetMcpServerArgs,
  type SetSubagentArgs,
  type SkillPathSource,
  type SkillDirPaths,
  type ExtensionPackDirPath,
  type ExtensionTarget,
  type ExtensionTargetFor,
  type ExtensionManager,
  type SkillExtensionTarget,
  type PackExtensionTarget,
  type CommandExtensionTarget,
  type McpServerExtensionTarget,
  type SubagentExtensionTarget,
} from "./service-interface.js";

// Workspace service implementation (layer)
export { layer, loadWorkspace, type WorkspaceLayerOptions } from "./service.js";

// Initialization
export {
  bootstrapWorkspace,
  initializeProjectWorkspace,
  ensureGlobalWorkspaceInitialized,
  ensureProjectWorkspaceInitialized,
} from "./initialization.js";
export type {
  WorkspaceInitializationInteractionService,
  WorkspaceInitializationInteractionTestState,
} from "./initialization-interaction.js";
export {
  WorkspaceInitializationInteraction,
  WorkspaceInitializationInteractionLive,
  WorkspaceInitializationInteractionTest,
} from "./initialization-interaction.js";

// Plan resolution
export type {
  ResolvePlanInteractionService,
  ResolvePlanInteractionTestState,
} from "./resolve-plan-interaction.js";
export {
  ResolvePlanInteraction,
  ResolvePlanInteractionLive,
  ResolvePlanInteractionTest,
} from "./resolve-plan-interaction.js";
// Plan display
export { displayPlan } from "./display-plan.js";

// Version currency
export {
  checkCurrency,
  collectAllCurrencyEntries,
  collectCommandCurrency,
  collectMcpServerCurrency,
  collectPackCurrency,
  collectSkillCurrency,
  collectSubagentCurrency,
  type CurrencyResult,
  type CurrencyStatus,
  type ExtensionCurrencyEntry,
} from "./version-currency/index.js";
