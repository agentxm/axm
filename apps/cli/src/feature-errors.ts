/**
 * Conversions from the typed failures of features the workspace kernel does
 * not render — lint staging, sharing, and inspection — into the CLI-facing
 * `AppError` envelope. Every failure the kernel renders, including publish
 * refusals and the Registry access family a challenged remote write or a
 * sign-in settles with, projects through `app-error/conversions`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeAppError, AppError } from "./app-error/index.js";
import { failureToAppError } from "./app-error/conversions.js";
import { ShareFailed } from "@agentxm/workspace/sharing";
import type { ExpectedCliError } from "./cli-runtime/index.js";
import {
  isRegistryAccessFailure,
  type RegistryAccessFailure,
} from "@agentxm/registry-access/authentication";
import { LintStagingFailed } from "@agentxm/workspace/linting";
import { WorkspaceInitializationCancelled } from "@agentxm/workspace/configuration";
import { WorkspaceInspectionFailed } from "@agentxm/workspace/inspection";

/**
 * Translate a lint input-staging failure: the implementation chose the
 * category, title, and wording at construction, so the envelope carries them
 * over 1:1.
 */
export const lintStagingFailedToAppError = (error: LintStagingFailed): AppError =>
  makeAppError({
    code: error.category,
    ...(error.title === undefined ? {} : { title: error.title }),
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/**
 * Convert any failure a workspace lint run can surface — the feature's own
 * typed refusal, or a known kernel failure it read the workspace through —
 * into the CLI-facing `AppError`.
 */
export const lintFailureToAppError = (failure: unknown): AppError =>
  failure instanceof LintStagingFailed
    ? lintStagingFailedToAppError(failure)
    : failureToAppError(failure);

/** Convert sharing refusals and workspace/Git read failures into the CLI envelope. */
export const shareFailureToAppError = (failure: unknown): AppError => {
  if (failure instanceof ShareFailed) {
    return makeAppError({ code: failure.category, detail: failure.detail });
  }
  return failureToAppError(failure);
};

/**
 * Convert only the Registry access capability's own typed failures into the
 * envelope, leaving every other expected failure untouched. Concretely typed
 * so the auth members leave the channel instead of being reabsorbed by a
 * generic parameter.
 */
export const coerceAuthFailure = (
  failure: ExpectedCliError | RegistryAccessFailure,
): ExpectedCliError => (isRegistryAccessFailure(failure) ? failureToAppError(failure) : failure);

/**
 * Convert configuration failures into the envelope while letting the typed
 * initialization cancellation pass through to the runtime envelope's silent
 * success exit.
 */
export const coerceConfigurationFailure = (failure: unknown): ExpectedCliError =>
  failure instanceof WorkspaceInitializationCancelled ? failure : failureToAppError(failure);

/**
 * Translate a workspace inspection query failure: the implementation chose
 * the category and wording at construction, so the envelope carries them over
 * 1:1 through the same normalization the envelope constructor applies.
 */
export const workspaceInspectionFailedToAppError = (error: WorkspaceInspectionFailed): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/**
 * Convert any failure a workspace inspection query can surface — the
 * feature's own typed failure, a known kernel or integration failure, or an
 * envelope that travelled through a still-coupled channel — into the
 * CLI-facing `AppError`.
 */
export const inspectionFailureToAppError = (failure: unknown): AppError => {
  if (failure instanceof WorkspaceInspectionFailed) {
    return workspaceInspectionFailedToAppError(failure);
  }
  return failureToAppError(failure);
};
