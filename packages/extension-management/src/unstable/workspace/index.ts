/**
 * Workspace module - plan-based orchestration for extension management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Plan pipeline primitives (`Plan`, `applyPlan`, `previewOrApplyPlan`, and
// `OperationHandler`) moved to `@agentxm/extension-management/unstable/plan`. Consumers
// import them from there directly.

// Source host provider seam (moved to the extension-model contract; re-exported
// here for this slice only — consumers migrate to @agentxm/extension-model)
export type {
  ExtensionFiles,
  FindOptions,
  NamedRegistryFindOptions,
  NamedRegistryResolution,
  SourceHostProvider,
} from "@agentxm/extension-model/unstable/sources/source-host-provider";

// Extension ref vocabulary
export type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
export type {
  GitHostedSkillRef,
  RegistrySkillRef,
  LocalSkillRef,
  WorkspaceSkillRef,
  SkillExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";
export type {
  GitHostedMcpServerRef,
  RegistryMcpServerRef,
  LocalMcpServerRef,
  WorkspaceMcpServerRef,
  McpServerExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
export type {
  GitHostedSubagentRef,
  RegistrySubagentRef,
  LocalSubagentRef,
  WorkspaceSubagentRef,
  SubagentExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/subagent";
export type {
  GitHostedRuleRef,
  RegistryRuleRef,
  LocalRuleRef,
  WorkspaceRuleRef,
  RuleExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/rule";
export type {
  GitHostedHookRef,
  RegistryHookRef,
  LocalHookRef,
  WorkspaceHookRef,
  HookExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/hook";
export type {
  GitHostedKnowledgeRef,
  RegistryKnowledgeRef,
  LocalKnowledgeRef,
  WorkspaceKnowledgeRef,
  KnowledgeExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
export type {
  RegistryPackRef,
  WorkspacePackRef,
  PackRef,
} from "@agentxm/extension-model/unstable/extensions/refs/pack";

// Installable-type vocabulary
export {
  installableExtensionTypes,
  installableExtensionTypePluralSegments,
  InstallableExtensionTypeSchema,
  InstallableExtensionTypePluralSchema,
  isInstallableExtensionType,
  isInstallableExtensionTypePlural,
  toInstallableExtensionType,
  toInstallableExtensionTypePlural,
  type InstallableExtensionType,
  type InstallableExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/installable-types";

// Extension path and identity vocabulary
export { ACQUIRED_EXTENSIONS_DIR } from "./constants.js";
export {
  acquiredExtensionDisplayPath,
  acquiredExtensionDisplayPathFromLockEntry,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  extensionContentFilename,
  extensionContentPath,
  type ExtensionPathLockEntry,
  type ExtensionPathSource,
  type ExtensionDirPaths,
} from "./extension-paths.js";
export {
  RenderedFilePathSchema,
  RenderedFilesMapSchema,
  computeSourceHash,
  type RenderedFilePath,
  type RenderedFilesMap,
} from "./rendered-files.js";
export {
  SourceHashSchema,
  type SourceHash,
} from "@agentxm/extension-model/unstable/sources/source-hash";
export { computePackageContentHash } from "./package-hash.js";
export {
  computeMaterializedTreeIntegrity,
  MaterializedTreeInvalid,
  TreeIntegritySchema,
  type TreeIntegrity,
} from "./materialized-tree.js";
export { sanitizeName, normalizeExtensionName } from "./extension-name.js";
export { computePackPathsForLayout } from "./pack-paths.js";
export { computePackManifestContentIdentity } from "./pack-manifest-content-identity.js";

// Plan-facing workspace vocabulary
export { ArtifactChangeSchema, type ArtifactChange } from "./artifact-change.js";
export {
  ConfiguredAgentOutcomeSchema,
  type ConfiguredAgentOutcome,
} from "./configured-agent-outcome.js";

// MCP entry settings semantics
export {
  AXM_MCP_METADATA_KEY,
  AxmMcpMetadataSchema,
  isAxmManagedMcpEntry,
  isMcpServerApplicableToAgent,
  readAxmMcpMetadata,
  type AxmMcpMetadata,
} from "./mcp-entry-semantics.js";

// Scope utilities
export {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
} from "@agentxm/extension-model/unstable/workspace-scope";
export {
  resolveProjectWorkspaceStatePaths,
  resolveUserWorkspaceLayout,
  type WorkspaceLayout,
} from "./layout.js";
export {
  AXM_DIR_NAME,
  USER_WORKSPACE_DIRECTORY,
  getProjectRuntimeDir,
  locateWorkspace,
  resolveUserAxmHome,
  resolveUserAxmHomePure,
  resolveUserHome,
  resolveUserWorkspaceRoot,
  resolveUserWorkspaceRootPure,
  type WorkspaceLocation,
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
  type ProspectivePackRef,
} from "./desired-state-graph.js";
export { desiredStateProblemText, desiredStateProblemsText } from "./desired-state-problem-text.js";
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

// Configured entry vocabulary (resolution policy lives in extension-lifecycle)
export { resolveWorkspaceExtensionRef } from "./configured-entry-resolution/workspace-ref.js";
export {
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
} from "./configured-entry-resolution/types.js";

// Source metadata
export { deriveSourceMetaFromLockType, type SourceMeta } from "./source-metadata.js";

// Scan plan readiness
export { scanPlanReadiness, type PlanReadinessReport } from "./operations/scan-plan-readiness.js";

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
} from "./operations/augment-plan.js";

// Workspace mutation facade
export {
  WorkspaceMutations,
  type WorkspaceMutationsService,
  type WorkspaceMutationsError,
  type WorkspaceMutationsOptions,
  type WorkspaceSettingsReadFailure,
  type WorkspaceLockfileReadFailure,
  type WorkspaceStateReadFailure,
  type WorkspaceSettingsMutationFailure,
  type WorkspaceLockfileMutationFailure,
  type WorkspaceStateMutationFailure,
  type SetSkillArgs,
  type SetPackArgs,
  type SetMcpServerArgs,
  type SetSubagentArgs,
  type SkillPathSource,
  type SkillDirPaths,
  type PackDirPath,
  type ExtensionTarget,
  type ExtensionTargetFor,
  type LockfileState,
  type WorkspaceTransactionRunner,
  type WorkspaceTransactionCapabilities,
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

// Per-extension-type lifecycle manager contract
export type {
  ExtensionManager,
  MaterializationObservation,
} from "../extension-workspace/extension-manager.js";

// Read-model per-source typed failure families
export {
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  SettingsDecodeError,
  SettingsIoError,
  SettingsParseError,
  WorkspaceRootEscape,
  type LockfileReadError,
  type SettingsReadError,
} from "./read-model/errors.js";

// Workspace-state typed failure families
export {
  CanonicalPathRemovalError,
  DesiredPackGraphIncomplete,
  InvalidAgentId,
  LockedSkillMissing,
  SettingsEntryMissing,
  SymlinkCreationError,
  WorkspaceLayoutError,
  WorkspaceNotInitialized,
} from "./errors.js";

// Workspace mutation service implementation (layer)
export { type WorkspaceLayerOptions } from "./service.js";
export { layer, loadWorkspace } from "./operations/load-workspace.js";
export {
  protectCreatedAncestors,
  protectWorkspacePath,
  readPendingClosureRestorationFailures,
  TransitionLockError,
  TransitionLockUnavailable,
  WorkspaceDirectoryError,
  WorkspaceRestorationError,
  WorkspaceRestorationIncomplete,
  WorkspaceSnapshotError,
  WorkspaceTransitionCompromised,
  type TransitionContention,
  type TransitionLockHolder,
  type WorkspaceTransactionFailure,
  type WorkspaceTransitionAcquireFailure,
} from "./transaction.js";
export {
  rollbackWorkspaceClosure,
  runWorkspaceTransaction,
  settleWorkspaceClosure,
  withWorkspaceClosure,
  type WorkspaceTransactionArgs,
} from "./operations/transaction.js";

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
export {
  FootprintRecorder,
  makeFootprintRecorder,
  readFootprint,
  recordFootprint,
  type FootprintObservation,
} from "./footprint-recorder.js";
export {
  TRANSITION_WAIT_BOUND_MILLIS,
  acquireWorkspaceTransitionLock,
  heldWorkspaceTransition,
  isWorkspaceTransitionHeldByThisInvocation,
  transitionLockPath,
  type HeldWorkspaceTransition,
} from "./operations/transition-lock.js";

export {
  AgentPresenceProbe,
  AgentPresenceUnavailable,
  type AgentPresenceProbeService,
} from "./read-model/agent-presence.js";
