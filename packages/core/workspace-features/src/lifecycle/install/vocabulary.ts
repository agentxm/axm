import type {
  SkillManager,
  SubagentManager,
  RuleManager,
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
} from "@agentxm/workspace-kernel/materialization";
import type { ReleaseAgePosture } from "@agentxm/workspace-kernel/resolution";
/**
 * The vocabulary every install route shares.
 *
 * Root install and the seven per-type installs are one use case with the type either fixed by the command or detected from
 * what the source offers. They therefore share one requirement set for
 * preparing the install and one failure vocabulary for resolving it; only the
 * grammar that produced the request differs.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  InstallStepRequirements,
  ResolveInstallRequirements,
  StepFailureConversion,
} from "@agentxm/workspace-kernel/reconciliation";
import type {
  ApprovalRecoveryMissing,
  CandidateFingerprintFailed,
  OperationJournal,
  PlanInteractionFailed,
  ResolvePlanInteraction,
} from "@agentxm/workspace-kernel/operations";
import type {
  ConfiguredAgentOutcomesProvider,
  LockfileValidationError,
  WorkspaceRecords,
  WorkspaceSettingsReadFailure,
  WorkspaceStateReadFailure,
} from "@agentxm/workspace-kernel/workspace-state";
import type {
  FootprintRecorder,
  WorkspaceTransactionScope,
  WorkspaceTransitionAcquireFailure,
} from "@agentxm/workspace-kernel/settlement";

/**
 * Every failure resolving a settled install or removal can surface: the
 * approval and interaction refusals, the candidate revalidation, and the
 * transition an apply could not acquire. Step failures travel inside the
 * resolution rather than being raised, so the operator still sees what each
 * closure settled.
 */
export type InstallExecutionFailure =
  | ApprovalRecoveryMissing
  | CandidateFingerprintFailed
  | LockfileValidationError
  | PlanInteractionFailed
  | WorkspaceSettingsReadFailure
  | WorkspaceStateReadFailure
  | WorkspaceTransitionAcquireFailure;

/**
 * Everything settling an install reads, and everything resolving the settled
 * candidate writes through: the sources it resolves against, the workspace
 * state ports and agent outcomes it reads, the journal and footprint the operation
 * records into, and the interaction that presents and confirms it.
 */
export type PrepareInstallRequirements =
  | SkillManager
  | SubagentManager
  | RuleManager
  | HookManager
  | KnowledgeManager
  | McpServerManager
  | PackManager
  | ReleaseAgePosture
  | InstallStepRequirements
  | ResolveInstallRequirements
  | ConfiguredAgentOutcomesProvider
  | FootprintRecorder
  | OperationJournal
  | ResolvePlanInteraction
  | WorkspaceRecords
  | StepFailureConversion
  | WorkspaceTransactionScope;
