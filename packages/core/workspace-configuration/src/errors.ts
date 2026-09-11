/**
 * Typed failures for workspace-configuration flows. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim. The CLI's interaction
 * implementation also maps prompt-guard failures into this family, so setup
 * prompts surface through the same conversion.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  StepFailure,
  type ApprovalRecoveryMissing,
  type CandidateFingerprintFailed,
  type PlanInteractionFailed,
  restorationIncompleteToStepFailure,
  workspaceStateReadFailureToStepFailure,
  workspaceTransactionFailureToStepFailure,
} from "@agentxm/workspace-operations";
import type {
  InvalidAgentId,
  LockfileValidationError,
  WorkspaceSettingsReadFailure,
  WorkspaceStateMutationFailure,
} from "@agentxm/workspace-state";
import type {
  WorkspaceRestorationIncomplete,
  WorkspaceTransactionFailure,
  WorkspaceTransitionAcquireFailure,
} from "@agentxm/workspace-transactions";

/**
 * Every failure resolving a prepared change through the plan pipeline can
 * surface: the workspace reads the candidate revalidates against, the
 * approval and interaction refusals, and the transition the apply could not
 * acquire. Step failures are carried inside the resolution, not raised.
 */
export type WorkspaceConfigurationExecutionFailure =
  | ApprovalRecoveryMissing
  | CandidateFingerprintFailed
  | LockfileValidationError
  | PlanInteractionFailed
  | WorkspaceSettingsReadFailure
  | WorkspaceTransitionAcquireFailure;

const CarriedSuggestedActionSchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
});

/**
 * A workspace-configuration flow could not proceed. `category` and `detail`
 * carry the boundary rendering 1:1.
 */
export class WorkspaceConfigurationFailed extends Schema.TaggedError<WorkspaceConfigurationFailed>()(
  "WorkspaceConfigurationFailed",
  {
    category: Schema.Literals(["conflict", "internal", "usage", "validation"]),
    detail: Schema.String,
    suggestions: Schema.optional(Schema.Array(CarriedSuggestedActionSchema)),
    recover: Schema.optional(Schema.String),
    cmd: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/**
 * Serialize a workspace-configuration failure into the plan-step vocabulary.
 * The producer already chose the category and the sentence, so both carry
 * over unchanged and the boundary renders the same words whether the failure
 * surfaced from a step or from `prepare`.
 */
export const configurationFailedToStepFailure = (
  failure: WorkspaceConfigurationFailed,
): StepFailure =>
  new StepFailure({
    category: failure.category,
    detail: failure.detail,
    ...(failure.suggestions === undefined ? {} : { suggestions: failure.suggestions }),
    ...(failure.cause === undefined ? {} : { cause: failure.cause }),
  });

/**
 * Every failure a workspace change this feature plans can surface: the
 * workspace's own read and write failures, the transaction machinery's, and
 * a step that already speaks the serialized vocabulary.
 */
export type WorkspaceChangeFailure =
  | InvalidAgentId
  | StepFailure
  | WorkspaceRestorationIncomplete
  | WorkspaceStateMutationFailure
  | WorkspaceTransactionFailure;

/**
 * Serialize a workspace change failure into the plan-step vocabulary. Read
 * and transaction failures keep the sentences the capability already chose,
 * so a failure reads the same wherever it was produced.
 */
export const workspaceChangeFailedToStepFailure = (
  failure: WorkspaceChangeFailure,
): StepFailure => {
  switch (failure._tag) {
    case "StepFailure":
      return failure;
    case "SettingsDecodeError":
    case "SettingsIoError":
    case "SettingsParseError":
    case "LockfileDecodeError":
    case "LockfileIoError":
    case "LockfileParseError":
    case "LockfileVersionUnsupported":
    case "WorkspaceRootEscape":
      return workspaceStateReadFailureToStepFailure(failure);
    case "TransitionLockError":
    case "TransitionLockUnavailable":
    case "WorkspaceDirectoryError":
    case "WorkspaceSnapshotError":
    case "WorkspaceTransitionCompromised":
      return workspaceTransactionFailureToStepFailure(failure);
    case "WorkspaceRestorationIncomplete":
      return restorationIncompleteToStepFailure(failure);
    case "InvalidAgentId":
      return new StepFailure({
        category: "validation",
        detail: `Unknown agent ID: ${failure.agentId}`,
        suggestions: [
          { description: "Inspect supported agent IDs.", cmd: "axm agents list --available" },
        ],
        cause: failure.cause,
      });
    case "SettingsWriteError":
      return new StepFailure({
        category: "internal",
        detail: `Workspace settings at ${failure.path} could not be written`,
        cause: failure.cause,
      });
    case "LockfileWriteError":
      return new StepFailure({
        category: "internal",
        detail: `Workspace lockfile at ${failure.path} could not be written`,
        cause: failure.cause,
      });
    case "LockfileValidationError":
      return new StepFailure({
        category: "validation",
        detail: `Workspace lockfile at ${failure.path} could not be validated`,
        cause: failure.cause,
      });
  }
};
