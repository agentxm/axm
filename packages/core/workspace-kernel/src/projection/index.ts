/**
 * @agentxm/workspace-kernel/projection public API.
 *
 * What AXM owns in agent-facing output, and what its current state means: the
 * ownership-unit registry and its region identities, projection planning and
 * the participant registry, contributor resolution over the desired-state
 * graph, region fences and managed-region
 * reconciliation, instruction targets, Knowledge discovery, MCP targeting and
 * drift classification, hook agent outcomes, and the invariant facts lint and
 * sync consume.
 *
 * Native format mechanics live behind the `./projection/agent-adapters` child
 * entry point. The layers that bind this capability to a running workspace
 * live behind `./live`, and deterministic ports for feature tests behind
 * `./testing`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Coding-agent repository: which agents this workspace projects onto
export {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "./agents/coding-agent-repository.js";
export { makeCodingAgentRepositoryService } from "./agents/repository.js";
export {
  allCodingAgents,
  configuredCodingAgents,
  isKnownAgentId,
  materializationCodingAgents,
  unknownConfiguredAgentIds,
} from "./agents/selection.js";

// Ownership units and their region identities
export {
  aggregateOwnershipUnits,
  KNOWLEDGE_REGION_OWNER,
  ownershipUnits,
  RULES_REGION_OWNER,
  type AggregateOwnershipUnitId,
  type OwnershipUnitDeclaration,
  type OwnershipUnitId,
  type ProjectionUnitObservation,
  type SingletonOwnershipUnitId,
} from "./units.js";

// Projection planning
export {
  applyPlannedProjections,
  applyProjectionPlans,
  applyProjectionPlansWithResults,
  mapProjectionPlanFailure,
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
} from "./planning.js";
export {
  aggregateUnitSubject,
  emptyProjectionParticipants,
  ProjectionParticipants,
  type AggregateUnitSubject,
  type ParticipantProjectionPlans,
  type ProjectionParticipantRequirements,
  type ProjectionParticipant,
  type ProjectionParticipantsService,
  type SubagentProjectionObservation,
  type SubagentProjectionObserver,
} from "./participants.js";
export {
  activeContributors,
  activeNodesOfType,
  contributorForNode,
  INCOMPLETE_DESIRED_STATE_BLOCKER_ID,
  contributorBlockersText,
  requireCompleteContributors,
  type AggregateContributor,
} from "./contributors.js";
export {
  formatProjectionExclusion,
  formatProjectionExclusions,
  type ProjectionContributorExclusion,
  type ProjectionExclusionReason,
} from "./exclusions.js";
export { projectionGeneration, projectionIsCurrent, projectionOutputDigest } from "./generation.js";
export {
  AuthoredContributorUnsupported,
  ContributorIdentityInvalid,
  ContributorTreeMismatch,
  ContributorUnresolved,
  DesiredStateIncomplete,
  isProjectionError,
  ManagedRegionViolation,
  ProjectionIoFailed,
  ProjectionParticipantFailed,
  ProjectionTargetUnsupported,
  type ManagedRegionFailure,
  type ProjectionError,
  type ProjectionParticipantFailure,
} from "./errors.js";
export { projectionErrorToStepFailure, type ProjectionFamilyFailure } from "./step-failure.js";

// Invariant facts
export {
  makeProjectionInvariantFact,
  PROJECTION_INVARIANT_PREDICATE,
  projectionFactHasInvalidOwnership,
  projectionFactIsViolation,
  projectionFactRequiresReconciliation,
  projectionUnavailabilityReason,
  WorkspaceInvariantFacts,
  type ProjectionInvariantFact,
  type ProjectionObservationStatus,
  type ProjectionUnavailableReasonCode,
  type WorkspaceInvariantFactsService,
} from "./invariant-facts.js";
export {
  ACCEPTED_RESOLUTION_INCOMPATIBLE_BLOCKER_ID,
  EXTENSION_CONSTRAINT_INVARIANT_PREDICATE,
  acceptedResolutionIncompatibleRecovery,
  acceptedResolutionIncompatibleText,
  extensionConstraintFactText,
  makeExtensionConstraintInvariantFact,
  makeProspectiveExtensionConstraintFacts,
  type ExtensionConstraintFactContributor,
  type ExtensionConstraintInvariantFact,
  type ProspectiveExtensionConstraintCandidate,
} from "./constraint-invariant-fact.js";
export { canonicalObservationFactText } from "./canonical-observation-fact.js";
export {
  buildPackDependencyReachability,
  type PackDependencyAuthority,
  type PackDependencyDeclaration,
  type PackDependencyMemberObservation,
  type PackDependencyReachability,
  type PackDependencyReachabilityClassification,
} from "./packs/dependency-reachability.js";

// Agent-native output discovery and ownership observation
export {
  extensionNameFromFilename,
  safeReadDirectory,
  safeReadFileString,
  type WorkspaceOwnershipIssue,
} from "./managed-file-discovery.js";
export {
  observeAgentOutputs,
  observeWorkspaceOwnershipIssues,
  type AgentOutputInventory,
  type AgentOutputObservation,
  type AgentOutputOwnershipProof,
  type ObserveAgentOutputsArgs,
} from "./agent-output-observation.js";
export {
  captureAgentOutputAuthority,
  captureSkillOutputSources,
  deriveAgentOutputAuthority,
  type AgentOutputAuthority,
} from "./output-authority.js";
export {
  observeMaterializationCurrency,
  type MaterializationCurrencyFailure,
  type ObservedMaterializationCurrencyArgs,
} from "./materialization-currency.js";
export { expectedProjectionNames, type ExpectedProjectionNames } from "./expected-names.js";

// Whole-file projection decisions
export {
  decideWholeFileWrite,
  type WholeFileDecision,
  type WholeFileLastWrite,
} from "./whole-file-decision.js";
export {
  decideOutputDeletion,
  retainedOutputDetail,
  type DeletionDecision,
} from "./deletion-guard.js";
export {
  DISCARD_MODIFIED_FLAG,
  ProjectionOutputPosture,
  REPLACE_UNRECORDED_FLAG,
  type ProjectionOutputPostureValue,
} from "./output-posture.js";

// Hook agent outcomes
export { evaluateHookAgentOutcome, type HookOutcomeTarget } from "./hooks/outcomes.js";

// Instruction projection
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
  instructionProjectionRecordsRows,
  instructionProjectionRemovalEffects,
  instructionProjectionNativeLocations,
  observeInstructionProjection,
  probeSymlinkSupport,
  removeInstructionsGitignore,
  removeManagedInstructionTargets,
  resolveInstructionMechanism,
  resolveInstructionTarget,
  resolveInstructionTargetShape,
  resolveInstructionsConfig,
  syncInstructions,
  withInstructionRowChanges,
  type AppliedInstructionProjection,
  type InstructionProjectionEffect,
  type InstructionProjectionPlan,
  type InstructionProjectionRows,
  type InstructionProjectionSnapshot,
  type InstructionSkipReason,
  type InstructionTargetResolution,
  type InstructionTargetShape,
  type InstructionsGitignoreStatus,
  type InstructionsStatus,
  type InstructionsSyncResult,
  type ObserveInstructionProjectionArgs,
  type PlannedInstructionItem,
  type ResolvedInstructionsConfig,
  type RetainedInstructionTarget,
  type SyncInstructionsArgs,
} from "./instructions/instructions.js";
// Instruction reconciliation shared by instruction management and rule
// activation: both reconcile the same alias set, and neither may import the
// other's feature.
export {
  activeInstructionsConfig,
  applyInstructionSurfacePlans,
  disableInstructionManagement,
  instructionReconciliationReadiness,
  instructionReadinessDetail,
  instructionStateIsCurrent,
  observeInstructions,
  observeInstructionSurfacePlans,
  plannedInstructionContributorObservation,
  readInstructionRows,
  reconcileInstructions,
  reconcileInstructionAliases,
  recordInstructionCopiesBeforeSourceWrite,
  removeInstructionTargetsFor,
  stageInstructionRows,
  type DisabledInstructionManagement,
  type InstructionOutputOverrides,
  type InstructionReadinessFailure,
  type InstructionsReconciliation,
} from "./instructions/reconciliation.js";

// Knowledge discovery region and instruction entry
export {
  knowledgeRegionGeneration,
  reconcileKnowledgeDiscovery,
  renderKnowledgeBaseTable,
  type KnowledgeDiscoveryArtifact,
  type KnowledgeDiscoveryBundle,
  type KnowledgeDiscoveryResult,
} from "./knowledge/discovery.js";
export {
  resolveKnowledgeInstructionEntry,
  type KnowledgeInstructionEntryReason,
  type KnowledgeInstructionEntryResolution,
} from "./knowledge/instruction-entry.js";
export {
  InstalledKnowledgeUnavailable,
  selectInstalledKnowledgeBundles,
  type InstalledKnowledgeBundle,
} from "./knowledge/installed-bundles.js";

// MCP projection facts
export type { McpInspectionError } from "./mcps/errors.js";
export {
  collectNativeAgentMcpServers,
  inspectDesiredMcpServer,
  withMcpInspectionReadView,
  mcpInspectionOutcome,
  mcpInspectionsCurrent,
  type AgentMcpInspectionStatus,
  type AgentMcpServerInspection,
  type CollectNativeAgentMcpServersArgs,
  type DesiredMcpServerInspection,
  type DesiredMcpServerSubject,
  type InspectDesiredMcpServerArgs,
  type NativeAgentMcpServer,
} from "./mcps/inspection.js";
export { diffAgentEntry, type DriftReport } from "./mcps/drift.js";

// Subagent managed output
export { subagentProvenance, type SubagentProvenance } from "./subagents/managed-file.js";
export {
  compileSubagentImplementation,
  type CompiledSubagentImplementation,
  type SubagentImplementationMode,
} from "./subagents/compile.js";
export {
  subagentProjectionGeneration,
  subagentUnitPath,
  type SubagentGenerationArgs,
} from "./subagents/managed-render.js";

export {
  nativeArtifactLocationOutcomes,
  retiredNativeArtifactLocationOutcomes,
} from "./native-artifact-locations.js";
export {
  projectionUnitPath,
  reconcileNativeManagedRegion,
  refreshNativeRegionReaders,
  retargetedRegionRows,
  type NativeManagedRegionArgs,
  type NativeManagedRegionResult,
  type NativeRegionReaderContext,
  type NativeRegionSource,
  type ProjectionLastWrite,
} from "./native-managed-region.js";

export { InstructionHealthSchema } from "./instructions/instruction-status.js";

export type {
  InstructionMechanism,
  InstructionHealth,
  InstructionTargetOwnership,
  ObservedInstructionForm,
  InstructionStatusItem,
} from "./instructions/instruction-status.js";

export { observeConfiguredSkillLocations } from "./skill-location-observation.js";
export {
  captureNativeRetentionWitnesses,
  validateNativeRetentionWitnesses,
  type NativeRetentionWitness,
} from "./native-retention.js";

export { nativePackageReferences } from "./native-package-references.js";
