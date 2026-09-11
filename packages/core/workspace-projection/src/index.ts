/**
 * @agentxm/workspace-projection public API.
 *
 * What AXM owns in agent-facing output, and what its current state means: the
 * ownership-unit registry and its region identities, projection planning and
 * the participant registry, contributor resolution over the desired-state
 * graph, managed-file ownership grammar and provenance banners, managed-region
 * reconciliation, instruction targets, Knowledge discovery, MCP targeting and
 * drift classification, hook agent outcomes, and the invariant facts lint and
 * sync consume.
 *
 * Native format mechanics live in `@agentxm/agent-integration`; the layers that
 * bind this capability to a running workspace live behind `./live`, and
 * deterministic ports for feature tests behind `./testing`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Coding-agent repository: which agents this workspace projects onto
export {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "./agents/coding-agent-repository.js";
export { DefaultCodingAgentRepository } from "./agents/repository.js";
export {
  allCodingAgents,
  configuredCodingAgents,
  isKnownAgentId,
  materializationCodingAgents,
  unknownConfiguredAgentIds,
  UNIVERSAL_AGENT_ID,
} from "./agents/selection.js";

// Ownership units and their region identities
export {
  aggregateOwnershipUnits,
  HOOK_FALLBACKS_REGION_OWNER,
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
  requireCompleteGraph,
  type AggregateContributor,
  type SourceLockEntryLike,
} from "./contributors.js";
export {
  formatProjectionExclusion,
  formatProjectionExclusions,
  type ProjectionContributorExclusion,
  type ProjectionExclusionReason,
} from "./exclusions.js";
export { projectionGeneration } from "./generation.js";
export {
  reconcileManagedRegionFile,
  type ManagedRegionReconciliation,
} from "./managed-region-adapter.js";
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

// Invariant facts
export {
  makeProjectionInvariantFact,
  PROJECTION_INVARIANT_PREDICATE,
  projectionFactHasInvalidOwnership,
  projectionFactIsViolation,
  projectionFactRequiresReconciliation,
  projectionUnavailability,
  WorkspaceInvariantFacts,
  type ProjectionInvariantFact,
  type ProjectionObservationStatus,
  type ProjectionUnavailableReasonCode,
  type WorkspaceInvariantFactsService,
} from "./invariant-facts.js";
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
} from "./constraint-invariant-fact.js";
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

// Managed-file ownership: banners, discovery, and agent-output observation
export {
  hasManagedFileBanner,
  insertManagedFileBanner,
  managedFileBanners,
  managedFileFormatForPath,
  managedFileMarker,
  stripManagedFileBanner,
  type ManagedFileBannerOptions,
  type ManagedFileFormat,
  type ManagedFileProvenance,
  type ManagedFileSource,
} from "./managed-file-banner.js";
export {
  extensionNameFromFilename,
  findManagedSubagentFiles,
  hasAxmManagedMarker,
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
  isObservedMaterializationCurrent,
  type MaterializationCurrencyFailure,
  type ObservedMaterializationCurrencyArgs,
} from "./materialization-currency.js";
export {
  expectedProjectionNames,
  expectedProjectionNamesOf,
  type ExpectedProjectionNames,
} from "./expected-names.js";

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
// Instruction reconciliation shared by instruction management and rule
// activation: both reconcile the same alias set, and neither may import the
// other's feature.
export {
  activeInstructionsConfig,
  disableInstructionManagement,
  instructionReconciliationReadiness,
  instructionStateIsCurrent,
  observeInstructions,
  reconcileInstructionTransition,
  removeInstructionTargetsFor,
  type DisabledInstructionManagement,
  type InstructionReadinessFailure,
} from "./instructions/reconciliation.js";

// Knowledge discovery region and instruction entry
export {
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
  collectManagedAgentMcpServers,
  inspectAgentMcpServer,
  inspectMcpServerAcrossAgents,
  type AgentMcpInspectionStatus,
  type AgentMcpServerInspection,
  type CollectManagedAgentMcpServersArgs,
  type InspectAgentMcpServerArgs,
  type ManagedAgentMcpServer,
} from "./mcps/inspection.js";
export { diffAgentEntry, type DriftReport } from "./mcps/drift.js";

// Subagent managed output
export { managedSubagentFile } from "./subagents/managed-file.js";
export {
  managedSubagentRenderInput,
  renderManagedSubagentOutputs,
  subagentOwnershipBanner,
  subagentProjectionGeneration,
  type ManagedSubagentRenderArgs,
} from "./subagents/managed-render.js";
