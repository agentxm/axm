/**
 * How workspace configuration flows refuse, and how a configuration change
 * serializes its failures. The producer owns the category choice and
 * user-facing wording; the kernel's `OperationRefused` carries them under the
 * configuration diagnostic kind and the kernel renders them once for every
 * path. The CLI's interaction implementation also refuses through this
 * helper for prompt-guard failures, so setup prompts surface through the same
 * rendering.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  refusalOf,
  type OperationRefused,
  type StepFailure,
} from "@agentxm/workspace-kernel/operations";
import type {
  InvalidAgentId,
  WorkspaceStateMutationFailure,
} from "@agentxm/workspace-kernel/workspace-state";
import type {
  WorkspaceRestorationIncomplete,
  WorkspaceTransactionFailure,
} from "@agentxm/workspace-kernel/settlement";
import { kernelFailureToStepFailure } from "@agentxm/workspace-kernel/reconciliation";

/**
 * Refuse a workspace configuration flow with the category, wording, and
 * recovery it decided.
 */
export const configurationRefused = refusalOf({
  kind: "workspace-configuration-failed",
  operation: "workspace.operation",
});

/**
 * Every failure a workspace change this feature plans can surface: its own
 * refusal, the workspace's read and write failures, the transaction
 * machinery's, and a step that already speaks the serialized vocabulary.
 */
export type WorkspaceChangeFailure =
  | InvalidAgentId
  | OperationRefused
  | StepFailure
  | WorkspaceRestorationIncomplete
  | WorkspaceStateMutationFailure
  | WorkspaceTransactionFailure;

/**
 * Serialize a workspace change failure into the plan-step vocabulary: the
 * same rendering the command boundary projects for that failure.
 */
export const workspaceChangeFailedToStepFailure = (failure: WorkspaceChangeFailure): StepFailure =>
  kernelFailureToStepFailure(failure);
