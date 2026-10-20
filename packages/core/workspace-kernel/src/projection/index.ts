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
// Ownership units and their region identities
export {
  aggregateOwnershipUnits,
  KNOWLEDGE_REGION_OWNER,
  RULES_REGION_OWNER,
  type AggregateOwnershipUnitId,
  type OwnershipUnitId,
  type ProjectionUnitObservation,
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
  type ProjectionPlan,
  type ProjectionRenderInput,
  type ProjectionSelection,
} from "./planning.js";
export {
  emptyProjectionParticipants,
  ProjectionParticipants,
  type ParticipantProjectionPlans,
  type ProjectionParticipantRequirements,
  type ProjectionParticipant,
} from "./participants.js";
export {
  activeContributors,
  INCOMPLETE_DESIRED_STATE_BLOCKER_ID,
  requireCompleteContributors,
} from "./contributors.js";
export {
  formatProjectionExclusion,
  formatProjectionExclusions,
  type ProjectionContributorExclusion,
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
  type ProjectionError,
  type ProjectionParticipantFailure,
} from "./errors.js";
export { projectionFailures } from "./step-failure.js";

// Invariant facts
export {
  makeProjectionInvariantFact,
  projectionFactHasInvalidOwnership,
  projectionFactRequiresReconciliation,
  WorkspaceInvariantFacts,
  type ProjectionInvariantFact,
} from "./invariant-facts.js";
export {
  ACCEPTED_RESOLUTION_INCOMPATIBLE_BLOCKER_ID,
  acceptedResolutionIncompatibleRecovery,
  acceptedResolutionIncompatibleText,
  extensionConstraintFactText,
  makeExtensionConstraintInvariantFact,
  makeProspectiveExtensionConstraintFacts,
  type ExtensionConstraintInvariantFact,
} from "./constraint-invariant-fact.js";
export { canonicalObservationFactText } from "./canonical-observation-fact.js";
export {
  buildPackDependencyReachability,
  type PackDependencyDeclaration,
  type PackDependencyMemberObservation,
  type PackDependencyReachability,
} from "./packs/dependency-reachability.js";

// Agent-native output discovery and ownership observation
export {
  extensionNameFromFilename,
  type WorkspaceOwnershipIssue,
} from "./managed-file-discovery.js";
export {
  observeAgentOutputs,
  observeWorkspaceOwnershipIssues,
  type AgentOutputInventory,
  type AgentOutputObservation,
  type AgentOutputOwnershipProof,
} from "./agent-output-observation.js";
export {
  captureAgentOutputAuthority,
  captureSkillOutputSources,
  deriveAgentOutputAuthority,
  type AgentOutputAuthority,
} from "./output-authority.js";
export { observeMaterializationCurrency } from "./materialization-currency.js";
export { expectedProjectionNames, type ExpectedProjectionNames } from "./expected-names.js";
export {
  observeProjectionOutput,
  projectionOutputUnits,
  type ProjectionOutputObservation,
} from "./projection-output-observation.js";

// Whole-file projection decisions
export { decideWholeFileWrite } from "./whole-file-decision.js";
export { decideOutputDeletion, retainedOutputDetail } from "./deletion-guard.js";
export {
  ProjectionOutputPosture,
  REPLACE_UNRECORDED_FLAG,
  type ProjectionOutputPostureValue,
} from "./output-posture.js";

// Hook agent outcomes
export { evaluateHookAgentOutcome } from "./hooks/outcomes.js";

// Instruction projection
export {
  InstructionMaintenanceFailed,
  type InstructionMaintenanceFailure,
} from "./instructions/errors.js";
export {
  instructionProjectionEffects,
  instructionProjectionIsCurrent,
  instructionProjectionRecordsRows,
  instructionProjectionRemovalEffects,
  instructionProjectionNativeLocations,
  observeInstructionProjection,
  probeSymlinkSupport,
  removeInstructionsGitignore,
  removeManagedInstructionTargets,
  resolveInstructionTarget,
  resolveInstructionsConfig,
  syncInstructions,
  withInstructionRowChanges,
  type InstructionProjectionEffect,
  type InstructionProjectionRows,
  type InstructionProjectionSnapshot,
  type InstructionsGitignoreStatus,
  type InstructionsStatus,
  type ResolvedInstructionsConfig,
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
  type InstructionOutputOverrides,
} from "./instructions/reconciliation.js";

// Knowledge discovery region and instruction entry
export {
  knowledgeRegionGeneration,
  reconcileKnowledgeDiscovery,
  type KnowledgeDiscoveryBundle,
} from "./knowledge/discovery.js";
export {
  resolveKnowledgeInstructionEntry,
  type KnowledgeInstructionEntryResolution,
} from "./knowledge/instruction-entry.js";
export {
  InstalledKnowledgeUnavailable,
  selectInstalledKnowledgeBundles,
} from "./knowledge/installed-bundles.js";

// MCP projection facts
export type { McpInspectionError } from "./mcps/errors.js";
export {
  inspectDesiredMcpServer,
  withMcpInspectionReadView,
  type AgentMcpServerInspection,
  type DesiredMcpServerInspection,
} from "./mcps/inspection.js";
export { diffAgentEntry } from "./mcps/drift.js";

// Subagent managed output
export { subagentProvenance, type SubagentProvenance } from "./subagents/managed-file.js";
export { compileSubagentImplementation } from "./subagents/compile.js";
export {
  subagentProjectionGeneration,
  type SubagentGenerationArgs,
} from "./subagents/managed-render.js";

export {
  nativeArtifactLocationOutcomes,
  retiredNativeArtifactLocationOutcomes,
} from "./native-artifact-locations.js";
export { projectionUnitPath, scopeUnitPath } from "./unit-path.js";
export {
  reconcileNativeManagedRegion,
  refreshNativeRegionReaders,
  retargetedRegionRows,
  type NativeManagedRegionArgs,
  type NativeRegionReaderContext,
  type NativeRegionSource,
} from "./native-managed-region.js";

export { InstructionHealthSchema } from "./instructions/instruction-status.js";

export type {
  InstructionMechanism,
  InstructionHealth,
  InstructionStatusItem,
} from "./instructions/instruction-status.js";

export { observeConfiguredSkillLocations } from "./skill-location-observation.js";
export {
  captureNativeRetentionWitnesses,
  validateNativeRetentionWitnesses,
  type NativeRetentionWitness,
} from "./native-retention.js";

export { nativePackageReferences } from "./native-package-references.js";

export {
  classifyNativeOutputHealth,
  classifyNativeOutputCollisions,
  type NativeOutputConcern,
} from "./native-output-conflicts.js";

// Dependents' inferred types name these, so their declaration emit must be
// able to; knip skips exports tagged public.
/** @public */
export type { InspectDesiredMcpServerArgs } from "./mcps/inspection.js";
