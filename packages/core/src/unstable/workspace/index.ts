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
export type { WorkspaceLayout } from "./layout.js";
export {
  AXM_DIR_NAME,
  getUserScopeDir,
  resolveUserScopeDir,
  resolveUserScopeDirPure,
} from "./paths.js";

// Read-model record rows + lifecycle views
export {
  configuredRecordRows,
  configuredRowsByName,
  installedRecordRows,
  installedRowsByName,
  isConfiguredRecordRow,
  isInstalledRecordRow,
  isUnmanagedRecordRow,
  recordRowsByName,
  unmanagedRecordRows,
  unmanagedRowsByName,
  type ConfiguredRecordRow,
  type ImplicitRecordRow,
  type InstalledRecordRow,
  type UnmanagedRecordRow,
} from "./read-model-record-rows.js";

export type { ReadModelRecordRow, PackagingKind } from "./read-model-record-types.js";

export {
  assessExtensionListItems,
  collectExtensionListItems,
  type ExtensionAssessment,
  type ExtensionAssessmentState,
  type ExtensionListFilter,
  type ExtensionListItem,
} from "./extension-list.js";

export {
  getKnowledgeLockEntries,
  getLockedEntries,
  lockEntryVersion,
  type AnyLockEntry,
  type AnyLockMap,
} from "./locked-entries.js";

export {
  buildDesiredStateGraph,
  isInlineDesiredExtension,
  isSourcedDesiredExtension,
  type DesiredExtensionNode,
  type DesiredExtensionOrigin,
  type DesiredConstraintContributor,
  type DesiredStateGraph,
  type DesiredStateProblem,
} from "./desired-state-graph.js";
export {
  isDesiredExtensionActive,
  type DesiredStateEnabledOrigin,
} from "./desired-state-enabled.js";
export { validateDesiredPackLock } from "./desired-pack-lock.js";
export {
  observeCanonicalExtension,
  canonicalPathForAcceptedExtension,
  type CanonicalConstraintContributor,
  type CanonicalConstraintMismatchObservation,
  type CanonicalObservation,
  type CanonicalObservationStatus,
} from "./canonical-observation.js";
export {
  acceptedResolutionRef,
  acceptedLockedResolutionRef,
  acceptedLockedCanonicalPath,
  prepareAcceptedCanonicalTransition,
  acceptedCanonicalObservation,
  usableAcceptedCanonical,
  usableAcceptedCanonicalObservation,
  usableAcceptedCanonicalRef,
  type AcceptedCanonicalObservation,
  type UsableAcceptedCanonical,
  type UsableAcceptedCanonicalObservation,
} from "./accepted-canonical-ref.js";
export { isObservedInstalled } from "./observed-installed.js";

// Configured entry resolution
export {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  resolveConfiguredRegistryEntry,
  resolveWorkspaceExtensionRef,
  type ConfiguredEntryFailureReason,
  type ConfiguredRegistryResolution,
  type ResolvedConfiguredEntry,
  type ResolvedConfiguredHook,
  type ResolvedConfiguredKnowledge,
  type ResolvedConfiguredMcpServer,
  type ResolvedConfiguredPack,
  type ResolvedConfiguredRule,
  type ResolvedConfiguredSkill,
  type ResolvedConfiguredSubagent,
} from "./configured-entry-resolution/index.js";

export {
  cleanupManagedArtifactsForRemovedAgents,
  cleanupStaleManagedSkillDirectories,
  cleanupStaleManagedSubagentFiles,
  findManagedSubagentFiles,
  hasAxmManagedMarker,
  inspectWorkspaceOwnership,
  type RemovedAgentArtifactCleanupResult,
  type RenderedFileCleanupResult,
  type WorkspaceOwnershipIssue,
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
  ExtensionInventoryClassificationSchema,
  ExtensionInventoryLifecycleSchema,
  ExtensionInventoryRowSchema,
  ExtensionInventorySchema,
  projectExtensionInventory,
  type ExtensionInventory,
  type ExtensionInventoryClassification,
  type ExtensionInventoryLifecycle,
  type ExtensionInventoryObservation,
  type ExtensionInventoryRow,
  type LifecycleInventoryCandidate,
  type ProjectExtensionInventoryInput,
} from "./read-model/extensions/inventory.js";
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
  type SetMcpServerArgs,
  type SetSubagentArgs,
  type SkillPathSource,
  type SkillDirPaths,
  type PackDirPath,
  type ExtensionTarget,
  type ExtensionTargetFor,
  type ExtensionManager,
  type WorkspaceTransactionRunner,
  type WorkspaceTransitionAcquirer,
  type WorkspaceTransitionRequest,
  type WorkspaceLifecycleTransactionArgs,
  type SkillExtensionTarget,
  type PackExtensionTarget,
  type McpServerExtensionTarget,
  type SubagentExtensionTarget,
  type RuleExtensionTarget,
  type HookExtensionTarget,
  type KnowledgeExtensionTarget,
} from "./service-interface.js";

// Workspace mutation service implementation (layer)
export { layer, loadWorkspace, type WorkspaceLayerOptions } from "./service.js";
export {
  protectCreatedAncestors,
  protectWorkspacePath,
  readPendingClosureRestorationFailures,
  restorationIncompleteToAppError,
  rollbackWorkspaceClosure,
  runWorkspaceTransaction,
  settleWorkspaceClosure,
  surfaceRestorationIncomplete,
  withWorkspaceClosure,
  WorkspaceRestorationIncomplete,
  type WorkspaceTransactionArgs,
} from "./transaction.js";

// Initialization
export {
  bootstrapWorkspace,
  initializeProjectWorkspace,
  ensureGlobalWorkspaceInitialized,
  ensureProjectWorkspaceInitialized,
} from "./initialization.js";
export type { SetupAgentCandidate } from "./initialization.js";
export {
  setupScopeSupport,
  setupScopeSupportOutcomes,
  type SetupScopeSupportCategory,
  type SetupScopeSupportOutcome,
  type SetupScopeSupportReasonCode,
  type SetupScopeSupportStatus,
} from "./setup-scope-support.js";
export {
  configuredAgentLifecycleOutcomes,
  EXTENSION_CONFIGURED_AGENT_POLICY,
  type ConfiguredAgentLifecycleState,
} from "./configured-agent-outcomes.js";
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
export { defaultOperationPresentation, displayPlan, presentationOf } from "./display-plan.js";
export {
  FootprintRecorder,
  makeFootprintRecorder,
  readFootprint,
  recordFootprint,
  type FootprintObservation,
  type FootprintRecorderService,
} from "./footprint-recorder.js";
export {
  TRANSITION_WAIT_BOUND_MILLIS,
  acquireWorkspaceTransitionLock,
  heldWorkspaceTransition,
  isWorkspaceTransitionHeldByThisInvocation,
  transitionLockPath,
  WorkspaceTransitionCompromised,
  type HeldWorkspaceTransition,
  type TransitionContention,
  type TransitionLockHolder,
} from "./transition-lock.js";

// Version currency
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
