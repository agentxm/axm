/**
 * @agentxm/extension-workspace public API.
 *
 * The extension-workspace kernel: the coding-agent service contracts and sync
 * helpers, the per-extension-type lifecycle manager contract, managed-file
 * projection and marker grammar, per-type semantic vocabulary, the
 * extension-type catalog and parity tables, and the TOML/YAML codec wrappers.
 * The environment-backed coding-agent repository layer lives behind `./live`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Coding-agent contracts and repository
export {
  CodingAgentRepository,
  type AddMcpServerArgs,
  type AddSubagentArgs,
  type CodingAgent,
  type CodingAgentRepositoryService,
  type CodingAgentRepositoryShape,
  type McpServerSyncFallbackSource,
  type McpServerSyncOutcome,
  type McpServerSyncTarget,
  type RemoveMcpServerArgs,
  type RemoveSubagentArgs,
  type ResolveSkillsDirArgs,
  type ResolveSkillsDirOutcome,
  type ResolveSubagentsDirArgs,
  type ResolveSubagentsDirOutcome,
  type SubagentSyncOutcome,
} from "./extension-workspace/coding-agent.js";
export {
  codingAgentForId,
  DefaultCodingAgentRepository,
} from "./extension-workspace/repository.js";

// Extension manager contract
export type {
  ExtensionManager,
  MaterializationObservation,
} from "./extension-workspace/extension-manager.js";

// Extension manager service tags (implementations live with lifecycle code)
export {
  HOOK_FALLBACKS_REGION_OWNER,
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
  RULES_REGION_OWNER,
  RuleManager,
  SkillManager,
  SubagentManager,
  type HookManagerService,
  type KnowledgeManagerService,
  type KnowledgeSyncResult,
  type RuleManagerService,
  type SubagentManagerService,
} from "./extension-workspace/managers.js";

// Failure vocabulary
export {
  CoupledDependencyFailure,
  WriteBackupRetained,
  type ExtensionManagerFailure,
  type ExtensionWorkspaceError,
  type SubagentSyncFailure,
} from "./extension-workspace/errors.js";

// Managed-file discovery
export {
  extensionNameFromFilename,
  findManagedSubagentFiles,
  hasAxmManagedMarker,
  safeReadDirectory,
  safeReadFileString,
  type WorkspaceOwnershipIssue,
} from "./extension-workspace/managed-file-discovery.js";
export {
  observeAgentOutputs,
  type AgentOutputInventory,
  type AgentOutputObservation,
  type AgentOutputOwnershipProof,
  type ObserveAgentOutputsArgs,
} from "./extension-workspace/agent-output-observation.js";

// MCP sync helpers
export {
  addMcpServerConfigFirst,
  addMcpServerConfigOnly,
  addMcpServerFromManifest,
  addMcpServerMixed,
  pruneManagedMcpServersForAgent,
  removeMcpServerConfigFirst,
  removeMcpServerConfigOnly,
  removeMcpServerFromManifest,
  removeMcpServerMixed,
  runCliInvocation,
  syncInlineMcpServerToAgent,
  syncInlineMcpServerToAgents,
  type CliInvocation,
  type CliInvocationResult,
  type ConfigFirstStrategy,
  type McpConfigSyncFailure,
  type MixedStrategyConfig,
  type PruneManagedMcpServersArgs,
  type SyncInlineMcpServerArgs,
} from "./extension-workspace/mcp-sync.js";

// Subagent sync helpers
export {
  addRooSubagent,
  addSubagentViaResolve,
  dirOutcomeToSubagentSyncOutcome,
  removeRooSubagent,
  removeSubagentFiles,
  removeSubagentViaResolve,
  renderManagedSubagentOutputs,
  subagentProjectionGeneration,
  writeSubagentFiles,
} from "./extension-workspace/subagent-sync.js";

// Extensions vocabulary
export {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  CreateDestinationInspectionFailed,
  CreateNameConfigured,
  ForkPackageConflict,
  ForkPackageFailed,
  ForkPackageInvalid,
  LifecyclePostconditionViolated,
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeImportUnsupported,
  PackageCopyFailed,
  PackageMaterializationFailed,
  ScaffoldedExtensionUnresolved,
  SourceAuthorityBlocked,
  StagedPackageInvalid,
  type ExtensionsError,
} from "./extensions/errors.js";
export {
  hasManagedFileBanner,
  insertManagedFileBanner,
  managedFileFormatForPath,
  managedFileMarker,
  stripManagedFileBanner,
  type ManagedFileBannerOptions,
  type ManagedFileFormat,
  type ManagedFileProvenance,
  type ManagedFileSource,
} from "./extensions/managed-file-banner.js";
export {
  applyOverrides,
  warnOnOrphanOverrides,
  type AgentOverrides,
  type AllAgentOverrides,
} from "./extensions/agent-overrides.js";

// Projection subsystem
export {
  EXTENSION_CONSTRAINT_INVARIANT_PREDICATE,
  extensionConstraintFactText,
  makeExtensionConstraintInvariantFact,
  makeProspectiveExtensionConstraintFacts,
  planExtensionConstraintFact,
  type ExtensionConstraintFactContributor,
  type ExtensionConstraintInvariantFact,
  type ExtensionConstraintPlanningDecision,
  type ProspectiveExtensionConstraintCandidate,
} from "./projection/constraint-invariant-fact.js";
export {
  activeContributors,
  activeNodesOfType,
  contributorForNode,
  INCOMPLETE_DESIRED_STATE_BLOCKER_ID,
  requireCompleteGraph,
  type AggregateContributor,
  type SourceLockEntryLike,
} from "./projection/contributors.js";
export {
  aggregateOwnershipUnits,
  ownershipUnits,
  type AggregateOwnershipUnitId,
  type OwnershipUnitDeclaration,
  type OwnershipUnitId,
  type ProjectionUnitObservation,
  type SingletonOwnershipUnitId,
} from "./projection/units.js";
export {
  applyPlannedProjections,
  applyProjectionPlans,
  applyProjectionPlansWithResults,
  observeProjectionPlans,
  planAggregateProjection,
  planDesiredStateGraph,
  planSingletonProjection,
  projectionPlanExclusionWarnings,
  type DesiredStateGraphPlanningDecision,
  type ProjectionAdapter,
  type ProjectionPlan,
  type ProjectionRenderInput,
  type ProjectionSelection,
} from "./projection/planning.js";
export {
  formatProjectionExclusion,
  formatProjectionExclusions,
  type ProjectionContributorExclusion,
  type ProjectionExclusionReason,
} from "./projection/exclusions.js";
export {
  managedKeyedBlockNames,
  reconcileKeyedBlock,
  reconcileManagedRegionFile,
  projectionGeneration,
  reconcilePatternList,
  type KeyedBlockReconciliation,
  type ManagedRegionReconciliation,
  type PatternListReconciliation,
} from "./projection/adapters.js";
export {
  commentStyleForTarget,
  markerForFile,
  MARKER_KIND_END,
  MARKER_KIND_FILE,
  MARKER_KIND_POINT,
  MARKER_KIND_START,
  MARKER_VERSION,
  parseMarker,
  serializeMarker,
  type FileCommentStyle,
  type ManagedMarker,
  type MarkerParseResult,
  type RegionMarker,
  type RegionName,
} from "./projection/marker-grammar.js";
export {
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorTreeMismatch,
  ContributorUnresolved,
  DesiredStateIncomplete,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionTargetUnsupported,
  type ProjectionError,
} from "./projection/errors.js";

// Hooks vocabulary
export {
  HookConfigInvalid,
  HookDefinitionInvalid,
  HookInstallStateMissing,
  HookIoFailed,
  type HookManagerError,
} from "./hooks/errors.js";
export {
  ambiguousHookCommands,
  isManagedHookEntry,
  managedHookCommands,
  managedHookUnits,
  pruneManagedHooksFromJson,
  readAmbiguousHookCommands,
  readManagedHookCommands,
  readManagedHookUnits,
  stripManagedHookGroups,
  stripManagedHooksFromJson,
  type ManagedHookUnit,
  updateHooksJson,
} from "./hooks/managed-groups.js";
export { evaluateHookAgentOutcome, type HookOutcomeTarget } from "./hooks/outcomes.js";

// Rules vocabulary
export {
  RuleDefinitionInvalid,
  RuleInstallStateMissing,
  type RuleManagerError,
} from "./rules/errors.js";

// MCP vocabulary
export {
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpEntryUnmanaged,
  McpInstallStateMissing,
  McpOwnershipMarkerInvalid,
  McpRegistryOnlyInstall,
  McpSharedTargetConflict,
  type McpManagerError,
} from "./mcps/errors.js";
export {
  removeAgentMcpConfig,
  resolveAgentMcpConfigTargetPath,
  writeAgentMcpConfig,
  type AgentMcpConfigWriteResult,
  type AgentMcpConfigWriteTarget,
  type RemoveAgentMcpConfigArgs,
  type WriteAgentMcpConfigArgs,
} from "./mcps/config-writer.js";
export {
  collectManagedAgentMcpServers,
  inspectAgentMcpServer,
  inspectMcpServerAcrossAgents,
  type AgentMcpInspectionStatus,
  type AgentMcpServerInspection,
  type CollectManagedAgentMcpServersArgs,
  type InspectAgentMcpServerArgs,
  type ManagedAgentMcpServer,
} from "./mcps/inspection.js";
export { buildAxmMcpMetadata, buildAxmMcpMetadataFromSettingsSource } from "./mcps/metadata.js";
export {
  diffAgentEntry,
  inferInlineRemoteTransport,
  projectExpectedEntry,
  renderEnvValue,
  type DriftReport,
  type ExpectedAgentEntry,
  type InlineRemoteTransport,
  type InlineRemoteTransportInference,
  type ProjectExpectedEntryArgs,
} from "./mcps/projection.js";
export {
  resolveMcpServer,
  type McpResolution,
  type ResolveMcpServerArgs,
} from "./mcps/resolution.js";
export {
  resolveSharedMcpTarget,
  type ResolvedSharedMcpTarget,
  type SharedMcpTargetConflict,
  type SharedMcpTargetMember,
  type SharedMcpTargetResolution,
  type SharedMcpTransport,
} from "./mcps/shared-target.js";
export { groupConfiguredMcpTargets, type McpTargetGroup } from "./mcps/targeting.js";

// Subagent vocabulary
export {
  SubagentContentUnreadable,
  SubagentDefinitionInvalid,
  SubagentInstallStateMissing,
  SubagentIoFailed,
  type SubagentManagerError,
} from "./subagents/errors.js";
export { buildSubagentLockEntry } from "./subagents/lock-entry-builder.js";
export { managedSubagentFile } from "./subagents/managed-file.js";
export {
  computeSubagentPathsForLayout,
  subagentContentFilename,
  subagentContentPath,
  type SubagentDirPaths,
  type SubagentPathSource,
} from "./subagents/paths.js";
export {
  buildRooModeEntry,
  mergeRooModes,
  removeRooMode,
  renderSubagent,
  rendered,
  selectSubagentRenderer,
  skipped,
  splitBody,
  type RooModeEntry,
  type RooModeResult,
} from "./subagents/rendering/index.js";
export {
  type LossyRenderingWarning,
  type SubagentRendered,
  type SubagentRenderer,
  type SubagentRenderInput,
  type SubagentRenderOutcome,
  type SubagentRenderOutput,
  type SubagentSkipped,
} from "./subagents/rendering/types.js";

// Skills vocabulary
export {
  AxmSkillCompatibilityUnavailable,
  AxmSkillIncompatible,
  SkillDefinitionInvalid,
  SkillInstallStateMissing,
  SkillMaterializationFailed,
  type SkillManagerError,
} from "./skills/errors.js";
export {
  evaluateAxmSkillCandidate,
  validateAxmSkillCandidate,
  type ValidateAxmSkillCandidateArgs,
} from "./skills/axm-skill-candidate.js";
export {
  AXM_SKILL_BUNDLED_APPLY_COMMAND,
  AXM_SKILL_BUNDLED_PREVIEW_COMMAND,
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  AXM_SKILL_FQN,
  AXM_SKILL_REGISTRY_APPLY_COMMAND,
  AXM_SKILL_REGISTRY_PREVIEW_COMMAND,
  AxmSkillCompatibilityPolicy,
  AxmSkillCompatibilityReasonSchema,
  AxmSkillCompatibilityRecoveryActionSchema,
  AxmSkillCompatibilityRecoverySchema,
  AxmSkillCompatibilityRecoveryStepSchema,
  AxmSkillCompatibilitySchema,
  evaluateAxmSkillCompatibility,
  formatAxmSkillCompatibilityTarget,
  makeAxmSkillCompatibilityPolicyLayer,
  validateAxmSkillCliVersionRange,
  type AxmSkillCliVersionRangeValidation,
  type AxmSkillCompatibility,
  type AxmSkillCompatibilityCandidate,
  type AxmSkillCompatibilityInput,
  type AxmSkillCompatibilityPolicyInput,
  type AxmSkillCompatibilityPolicyService,
  type AxmSkillCompatibilityReason,
  type AxmSkillCompatibilityRecovery,
  type AxmSkillCompatibilityRecoveryAction,
  type AxmSkillCompatibilityRecoveryStep,
} from "./skills/axm-skill-compatibility.js";
export {
  readAxmSkillWorkspaceCompatibility,
  type ReadAxmSkillWorkspaceCompatibilityArgs,
} from "./skills/axm-skill-workspace-compatibility.js";

// Packs vocabulary
export {
  PackArchiveFetchFailed,
  PackConstraintShadowed,
  PackDefinitionInvalid,
  PackDependencyConflict,
  PackDependencyInvalid,
  PackDependencyMissing,
  PackDependencyUnsatisfied,
  PackInstallStateMissing,
  PackStagingFailed,
  type PackManagerError,
} from "./packs/errors.js";
export {
  buildPackDependencyReachability,
  classifyPackDependencyReachability,
  packDependencyReachabilityByMember,
  type PackDependencyAuthority,
  type PackDependencyDeclaration,
  type PackDependencyMemberObservation,
  type PackDependencyReachability,
  type PackDependencyReachabilityClassification,
} from "./packs/dependency-reachability.js";

// Knowledge vocabulary
export {
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeInstallStateMissing,
  KnowledgeIoFailed,
  KnowledgeObservableContractViolated,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
  type KnowledgeManagerError,
} from "./knowledge/errors.js";
export {
  KNOWLEDGE_REGION_OWNER,
  reconcileKnowledgeDiscovery,
  renderKnowledgeBaseTable,
  type KnowledgeDiscoveryArtifact,
  type KnowledgeDiscoveryBundle,
  type KnowledgeDiscoveryResult,
} from "./knowledge/discovery.js";
export {
  inspectKnowledgePackage,
  readKnowledgePackageManifest,
} from "./knowledge/package-inspection.js";

// Extension-type catalog and parity
export { EXTENSION_TYPES, EXTENSION_TYPES_BY_ID } from "./extension-types/catalog.js";
export {
  getExtensionTypeDefinition,
  getStandardForExtensionType,
  isSpecTracked,
} from "./extension-types/derive.js";
export {
  exemptedObligations,
  PARITY_EXEMPTIONS,
  parityExemptionRows,
  type ParityExemption,
} from "./extension-types/parity/exemptions.js";
export {
  EXTENSION_LIFECYCLE_CONTRACT,
  LIFECYCLE_MUTATION_VERBS,
  type ExtensionLifecycleContract,
  type LifecycleMutationVerb,
  type LifecycleScopeSupport,
  type LifecycleUpdateSelection,
} from "./extension-types/parity/lifecycle.js";
export {
  OBLIGATION_IDS,
  OBLIGATION_TIERS,
  obligationsVerifiedBy,
  PARITY_OBLIGATIONS,
  type ObligationDef,
  type ObligationId,
  type ObligationTier,
} from "./extension-types/parity/obligations.js";
export {
  RECONCILIATION_SOURCE_CLASSES,
  WORKSPACE_RECONCILIATION_OBLIGATIONS,
  type ReconciliationApplicability,
  type ReconciliationObligation,
  type ReconciliationSourceClass,
} from "./extension-types/parity/reconciliation.js";

// TOML/YAML codec wrappers
export {
  extractTomlQuotedStrings,
  parseTomlInlineString,
  parseTomlInlineTableArray,
  parseTomlStringEntries,
  parseTomlValue,
  readTomlSection,
  stringifyToml,
  stringifyTomlKey,
  stringifyTomlLines,
  stringifyTomlValue,
  type TomlStringEntry,
} from "./toml/index.js";
export {
  deleteYamlEntry,
  managedYamlNames,
  parseYaml,
  readYamlEntry,
  setYamlEntry,
  setYamlScalar,
} from "./yaml/index.js";

// Transient backup
export {
  createTransientFileBackup,
  removeTransientFileBackup,
  runWithTransientFileBackup,
  TransientBackupFailed,
  type TransientFileBackup,
} from "./utils/transient-backup.js";

// Instruction-projection semantics (kept inward so sync, lint, and
// configuration features share one implementation)
export {
  InstructionMaintenanceFailed,
  type InstructionMaintenanceFailure,
} from "./instructions/errors.js";
export {
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  buildInstructionProjectionPlan,
  instructionProjectionEffects,
  instructionProjectionIsCurrent,
  instructionProjectionRemovalEffects,
  observeInstructionProjection,
  probeSymlinkSupport,
  reconcileInstructionTargets,
  removeInstructionsGitignore,
  removeManagedInstructionTargets,
  resolveInstructionMechanism,
  resolveInstructionTarget,
  resolveInstructionTargetShape,
  resolveInstructionsConfig,
  syncInstructions,
  type InstructionHealth,
  type InstructionMechanism,
  type InstructionProjectionEffect,
  type InstructionProjectionPlan,
  type InstructionProjectionSnapshot,
  type InstructionSkipReason,
  type InstructionStatusItem,
  type InstructionTargetOwnership,
  type InstructionTargetResolution,
  type InstructionTargetShape,
  type InstructionsGitignoreStatus,
  type InstructionsStatus,
  type InstructionsSyncResult,
  type ObserveInstructionProjectionArgs,
  type ObservedInstructionForm,
  type PlannedInstructionItem,
  type ResolvedInstructionsConfig,
  type SyncInstructionsArgs,
} from "./instructions/instructions.js";
export {
  makeProjectionInvariantFact,
  makeWorkspaceInvariantFactsLive,
  PROJECTION_INVARIANT_PREDICATE,
  projectionFactIsViolation,
  projectionFactHasInvalidOwnership,
  projectionFactRequiresReconciliation,
  WorkspaceInvariantFacts,
  type ProjectionInvariantFact,
  type ProjectionObservationStatus,
  type WorkspaceInvariantFactsService,
} from "./projection/invariant-facts.js";
export {
  makePlatformPackFileAccessor,
  type PackAccessorPlatform,
} from "./lint-accessors/pack-accessor-platform.js";
export {
  makePlatformSkillFileAccessor,
  type SkillAccessorPlatform,
} from "./lint-accessors/skill-accessor-platform.js";

// Shared extension machinery: copy, canonical-directory staging/swap, reuse,
// configured-entry predicates, on-disk materializability, source authority,
// and the install/uninstall/materialize step builders
export {
  copyExtensionDirectory,
  formatCopyExtensionDirectoryFailure,
  type CopyExtensionDirectoryFailureDetails,
  type CopyExtensionDirectoryOptions,
} from "./extensions/copy-directory.js";
export { shouldReuseCanonicalInstall } from "./extensions/canonical-reuse.js";
export {
  enabledConfiguredEntries,
  isConfiguredEntryEnabled,
  type ConfiguredEntryEnabledState,
} from "./extensions/configured-entry.js";
export {
  configuredMcpServersToDiskRefs,
  configuredPacksToDiskRefs,
  configuredSkillsToDiskRefs,
  configuredSubagentsToDiskRefs,
} from "./extensions/materializable-from-disk.js";
export {
  evaluateSourceAuthority,
  type SourceAuthorityBlockedCause,
  type SourceAuthorityBlockedFact,
  type SourceAuthorityDecision,
  type SourceAuthorityInput,
  type SourceAuthorityRelationship,
  type SourceAuthorityTarget,
  type WorkspaceAuthorityStatus,
} from "./extensions/source-authority.js";
export {
  canReuseExternalPackage,
  canReuseInstalledPackage,
  canonicalMaterializationPaths,
  createCanonicalDirectory,
  materializeExternalPackage,
  materializeExternalPackageWithTreeIntegrity,
  recoverCanonicalDirectory,
  replaceCanonicalDirectory,
  replaceCanonicalDirectoryWithInspection,
  type CanReuseExternalPackageArgs,
  type CanReuseInstalledPackageArgs,
  type CanonicalDirectoryInspection,
  type CanonicalDirectoryReplacementError,
  type CreateCanonicalDirectoryArgs,
  type MaterializeExternalPackageArgs,
  type MaterializedPackage,
  type RecoverCanonicalDirectoryArgs,
  type ReplaceCanonicalDirectoryArgs,
  type ReplaceCanonicalDirectoryWithInspectionArgs,
} from "./extensions/canonical-directory.js";
export {
  buildAuthoredExtensionStep,
  buildInstallOperation,
  buildMaterializeOperation,
  buildNewExtensionStep,
  buildUninstallOperation,
  extensionRefLifecycleWarnings,
  extensionRefRegistryLifecycle,
  formatPackageUrlParts,
  targetFromRef,
  toLabel,
  toLabelWithCompanions,
  toStepKey,
  type AuthoredExtensionOperationArgs,
  type CallerStepFailure,
  type InstallOperationArgs,
  type MaterializeOperationArgs,
  type NewExtensionOperationArgs,
  type StepFailureAdapter,
  type UninstallOperationArgs,
  type UninstallRetentionPolicy,
} from "./extensions/operations.js";
export {
  resolveKnowledgeInstructionEntry,
  type KnowledgeInstructionEntryReason,
  type KnowledgeInstructionEntryResolution,
} from "./knowledge/instruction-entry.js";
export {
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  groupInstallTargetsByDirectory,
  skillArtifactFromTargets,
  type InstallableSkillTarget,
  type InstallableSkillTargetLocation,
} from "./skills/skill-artifact.js";
