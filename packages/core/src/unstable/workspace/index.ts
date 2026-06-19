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
export {
  AXM_DIR_NAME,
  getUserScopeDir,
  resolveUserScopeDir,
  resolveUserScopeDirPure,
} from "./paths.js";

// Read-model record conversion helpers
export {
  toConfiguredCommandRecord,
  toConfiguredExtensionRefRecord,
  toConfiguredSkillRecord,
  toInstalledCommandRecord,
  toInstalledExtensionRefRecord,
  toInstalledSkillRecord,
  toUnmanagedCommandRecord,
  toUnmanagedExtensionRefRecord,
  toUnmanagedSkillRecord,
} from "./read-model-record-converters.js";

// Read-model record types
export type {
  ReadModelRecordRow,
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
} from "./read-model-record-types.js";

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
  resolveConfiguredFiles,
  resolveConfiguredHook,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  type ConfiguredEntryFailureReason,
  type ResolvedConfiguredCommand,
  type ResolvedConfiguredEntry,
  type ResolvedConfiguredFiles,
  type ResolvedConfiguredHook,
  type ResolvedConfiguredMcpServer,
  type ResolvedConfiguredPack,
  type ResolvedConfiguredRule,
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

export {
  AXM_MANAGED_MARKER,
  cleanupManagedArtifactsForRemovedAgents,
  cleanupStaleManagedSubagentFiles,
  hasAxmManagedMarker,
  type RemovedAgentArtifactCleanupResult,
  type RenderedFileCleanupResult,
} from "./rendered-file-cleanup.js";

// Source metadata
export { deriveSourceMetaFromLockType, type SourceMeta } from "./source-metadata.js";

// Scan plan readiness
export { scanPlanReadiness, type PlanReadinessReport } from "./scan-plan-readiness.js";

// Workspace read model
export {
  makeWorkspaceReadModel,
  WorkspaceReadModelConfig,
  type RawSourceBytes,
  type ScopedOwnerApi,
  type ScopedSourceHostsApi,
  type ScopedStateApi,
  type WorkspaceReadModel,
  type WorkspaceReadModelConfigService,
} from "./read-model/service.js";
export { AgentRootResolver, AgentRootResolverLive } from "./read-model/agent-root-resolver.js";
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
} from "./read-model/discovery/index.js";

// Augment plan
export {
  augmentPlanWithReconciliation,
  type AugmentedPlanResult,
  type DegradedLockfileState,
  type LockfileState,
} from "./augment-plan.js";

// Workspace mutation facade
export {
  WorkspaceMutations,
  type WorkspaceMutationsService,
  type WorkspaceMutationsError,
  type WorkspaceMutationsOptions,
  type SetSkillArgs,
  type SetPackArgs,
  type SetCommandArgs,
  type SetFilesArgs,
  type SetMcpServerArgs,
  type SetSubagentArgs,
  type SkillPathSource,
  type SkillDirPaths,
  type PackDirPath,
  type ExtensionTarget,
  type ExtensionTargetFor,
  type ExtensionManager,
  type SkillExtensionTarget,
  type PackExtensionTarget,
  type CommandExtensionTarget,
  type McpServerExtensionTarget,
  type SubagentExtensionTarget,
  type FilesExtensionTarget,
  type RuleExtensionTarget,
  type HookExtensionTarget,
} from "./service-interface.js";

// Workspace mutation service implementation (layer)
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

// Lockfile update policy
export {
  ignoreMalformedWorkspaceLockfileRead,
  isMalformedWorkspaceLockfileRead,
} from "./lockfile-update-policy.js";

// Version currency
export {
  checkCurrency,
  collectAllCurrencyEntries,
  collectAllUpdateEntries,
  collectCommandCurrency,
  collectMcpServerCurrency,
  collectPackCurrency,
  collectSkillCurrency,
  collectSkillSourceFreshness,
  collectSubagentCurrency,
  type CurrencyResult,
  type CurrencyStatus,
  type ExtensionCurrencyEntry,
  type ExtensionSourceFreshnessEntry,
  type ExtensionUpdateEntry,
} from "./version-currency/index.js";
