/**
 * Failures resolving a settled activation through the plan pipeline.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type {
  ApprovalRecoveryMissing,
  CandidateFingerprintFailed,
  PlanInteractionFailed,
} from "@agentxm/workspace-operations";
import type {
  LockfileValidationError,
  WorkspaceSettingsReadFailure,
} from "@agentxm/workspace-state";
import type { WorkspaceTransitionAcquireFailure } from "@agentxm/workspace-transactions";

/**
 * Every failure resolving a settled activation can surface: the approval and
 * interaction refusals, the candidate revalidation, and the transition the
 * apply could not acquire. Step failures travel inside the resolution rather
 * than being raised, so the operator still sees what each closure settled.
 */
export type SetActivationExecutionFailure =
  | ApprovalRecoveryMissing
  | CandidateFingerprintFailed
  | LockfileValidationError
  | PlanInteractionFailed
  | WorkspaceSettingsReadFailure
  | WorkspaceTransitionAcquireFailure;
