/**
 * Typed failures for workspace configuration flows. The producer owns the
 * category choice and user-facing wording, and the kernel renders the carried
 * fields once for every path. The CLI's interaction implementation also maps
 * prompt-guard failures into this family, so setup prompts surface through
 * the same rendering.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import type {
  ApprovalRecoveryMissing,
  CandidateFingerprintFailed,
  PlanInteractionFailed,
} from "../transitions/planning/index.js";
import { makeStepFailure, type StepFailure } from "../transitions/planning/plan/errors.js";
import type {
  InvalidAgentId,
  LockfileValidationError,
  WorkspaceSettingsReadFailure,
  WorkspaceStateMutationFailure,
} from "../desired-state/index.js";
import type {
  WorkspaceRestorationIncomplete,
  WorkspaceTransactionFailure,
  WorkspaceTransitionAcquireFailure,
} from "../transitions/settlement/index.js";
import { workspaceFailureToStepFailure } from "../reconciliation/failure-rendering.js";

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
 * A workspace configuration flow could not proceed. `category` and `detail`
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
 * Render a workspace configuration failure. The producer already chose the
 * category and the sentence, so both carry over unchanged, `recover` and
 * `cmd` lead the suggestions, and the failure reads the same whether it
 * surfaced from a step or from `prepare`.
 */
export const configurationFailedToStepFailure = (
  failure: WorkspaceConfigurationFailed,
): StepFailure =>
  makeStepFailure({
    category: failure.category,
    detail: failure.detail,
    recover: failure.recover,
    cmd: failure.cmd,
    suggestions: failure.suggestions,
    cause: failure.cause,
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
 * Serialize a workspace change failure into the plan-step vocabulary: the
 * same rendering the command boundary projects for that failure.
 */
export const workspaceChangeFailedToStepFailure = (failure: WorkspaceChangeFailure): StepFailure =>
  workspaceFailureToStepFailure(failure);
