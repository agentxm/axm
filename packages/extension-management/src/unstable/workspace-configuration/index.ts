/**
 * Workspace-configuration feature: workspace initialization and setup flows,
 * plus agent-instructions projection management.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  bootstrapWorkspace,
  initializeProjectWorkspace,
  ensureUserWorkspaceInitialized,
  ensureProjectWorkspaceInitialized,
  type SetupAgentCandidate,
} from "./initialization.js";

export type {
  InstructionSourceChoice,
  SetupAgentScan,
  SetupPlanRow,
  WorkspaceInitializationInteractionService,
  WorkspaceInitializationInteractionTestState,
} from "./initialization-interaction.js";
export {
  WorkspaceInitializationCancelled,
  WorkspaceInitializationInteraction,
  WorkspaceInitializationInteractionTest,
} from "./initialization-interaction.js";

export {
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  instructionProjectionIsCurrent,
  instructionProjectionEffects,
  instructionProjectionRemovalEffects,
  observeInstructionProjection,
  probeSymlinkSupport,
  reconcileInstructionTargets,
  resolveInstructionTarget,
  resolveInstructionMechanism,
  resolveInstructionsConfig,
  removeManagedInstructionTargets,
  removeInstructionsGitignore,
  syncInstructions,
  type InstructionProjectionSnapshot,
  type InstructionProjectionEffect,
  type InstructionsGitignoreStatus,
  type InstructionHealth,
  type InstructionMechanism,
  type InstructionsStatus,
  type InstructionsSyncResult,
  type InstructionStatusItem,
  type InstructionTargetOwnership,
  type ObservedInstructionForm,
  type ResolvedInstructionsConfig,
} from "./instructions.js";
