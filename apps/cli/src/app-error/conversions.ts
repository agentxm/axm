/**
 * The application boundary's projection of rendered failures into the
 * CLI-facing `AppError` envelope.
 *
 * The failure catalog recognizes and renders every typed failure the
 * workspace kernel and its features construct or carry once, into a
 * `StepFailure`; a plan step settles with the same value. This module
 * projects the rendered failure into the envelope and adds only what the
 * application itself supplied, so a failure reads the same whether it
 * surfaced here or inside a plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  InstallSelectionUnavailable,
  OPERATION_ERROR_CATEGORIES,
  type StepFailure,
} from "@agentxm/workspace-kernel/operations";

import { AppError, makeAppError, type AppErrorCode } from "./app-error.js";
import {
  isWorkspaceFailure,
  workspaceFailureToStepFailure,
  type WorkspaceFailure,
} from "./failure-catalog.js";

// The kernel's serialized category vocabulary and the CLI's AppErrorCode must
// stay the same strings; divergence is a compile error here, at the boundary
// that owns the mapping.
OPERATION_ERROR_CATEGORIES satisfies ReadonlyArray<AppErrorCode>;

/**
 * Project a rendered failure into the CLI-facing `AppError` envelope: the
 * category is the code, and every rendered field carries over 1:1. The
 * envelope supplies the category's default title where the rendering chose
 * none.
 */
export const stepFailureToAppError = (failure: StepFailure): AppError =>
  makeAppError({
    code: failure.category,
    ...(failure.title === undefined ? {} : { title: failure.title }),
    detail: failure.detail,
    ...(failure.problem === undefined ? {} : { problem: failure.problem }),
    ...(failure.metadata === undefined ? {} : { metadata: failure.metadata }),
    ...(failure.retryable === undefined ? {} : { retryable: failure.retryable }),
    ...(failure.status === undefined ? {} : { status: failure.status }),
    ...(failure.blockedOn === undefined ? {} : { blockedOn: failure.blockedOn }),
    ...(failure.action === undefined ? {} : { action: failure.action }),
    ...(failure.inputs === undefined ? {} : { inputs: failure.inputs }),
    ...(failure.suggestions === undefined ? {} : { suggestions: failure.suggestions }),
    ...(failure.cause === undefined ? {} : { cause: failure.cause }),
  });

/**
 * Convert a workspace failure into the CLI-facing `AppError` envelope. An
 * `AppError` passes through unchanged. A selection the terminal interaction
 * could not obtain carries the interaction's own guidance as its cause, and
 * that guidance is what the terminal prints.
 */
export const toAppError = (error: WorkspaceFailure | AppError): AppError => {
  if (error instanceof AppError) return error;
  if (error instanceof InstallSelectionUnavailable && error.cause instanceof AppError) {
    return error.cause;
  }
  return stepFailureToAppError(workspaceFailureToStepFailure(error));
};

/**
 * Convert any failure a command can surface — a workspace failure, an
 * envelope that already travelled the channel, or an unrecognized value such
 * as a squashed defect — into the CLI-facing `AppError`. This is the one
 * classifier of an arbitrary failure: an unrecognized value is an internal
 * error whose reason is the message it carried, with the value as its cause.
 */
export const failureToAppError = (failure: unknown): AppError => {
  if (failure instanceof AppError) return failure;
  if (isWorkspaceFailure(failure)) return toAppError(failure);
  return makeAppError({
    code: "internal",
    detail: failure instanceof Error ? failure.message : String(failure),
    cause: failure,
  });
};
