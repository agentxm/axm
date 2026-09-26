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
import {
  type ApprovalRecoveryMissing,
  type CandidateFingerprintFailed,
  type PlanInteractionFailed,
  FailureSuggestedActionSchema,
  makeStepFailure,
  type StepFailure,
} from "../operations/index.js";
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
import { kernelFailureDetail, renderKernelFailure } from "../reconciliation/index.js";

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

/**
 * A workspace configuration flow could not proceed. `category` and `detail`
 * carry the boundary rendering 1:1.
 */
export class WorkspaceConfigurationFailed extends Schema.TaggedError<WorkspaceConfigurationFailed>()(
  "WorkspaceConfigurationFailed",
  {
    category: Schema.Literals(["conflict", "internal", "usage", "validation"]),
    detail: Schema.String,
    suggestions: Schema.optional(Schema.Array(FailureSuggestedActionSchema)),
    recover: Schema.optional(Schema.String),
    cmd: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

/** Every failure the configuration feature constructs. */
export type ConfigurationFamilyFailure = WorkspaceConfigurationFailed;

/** Whether an untyped failure is one the configuration feature constructs. */
export const isConfigurationFamilyFailure = (
  failure: unknown,
): failure is ConfigurationFamilyFailure => failure instanceof WorkspaceConfigurationFailed;

/**
 * Render a workspace configuration failure. The producer already chose the
 * category and the sentence, so both carry over unchanged, `recover` and
 * `cmd` lead the suggestions, and the failure reads the same whether it
 * surfaced from a step or from `prepare`.
 */
export const configurationFailureToStepFailure = (
  failure: ConfigurationFamilyFailure,
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

/** The sentence a transition's deciding failure reads with inside a configuration change. */
const configurationFailureDetail = (failure: unknown): string | undefined =>
  isConfigurationFamilyFailure(failure)
    ? configurationFailureToStepFailure(failure).detail
    : kernelFailureDetail(failure);

/**
 * Serialize a workspace change failure into the plan-step vocabulary: the
 * same rendering the command boundary projects for that failure.
 */
export const workspaceChangeFailedToStepFailure = (failure: WorkspaceChangeFailure): StepFailure =>
  renderKernelFailure(failure, { detailOf: configurationFailureDetail });
