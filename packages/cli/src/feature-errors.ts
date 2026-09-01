/**
 * Conversions from vertical-feature typed failures into the CLI-facing
 * `AppError` envelope. The shared `toAppError` dispatcher lives with the
 * extension-management residue and may not depend on feature packages, so the
 * application boundary owns these conversions directly.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import {
  appErrorToStepFailure,
  toAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";
import type { LintStagingFailed } from "@agentxm/workspace-lint";
import {
  WorkspaceSyncFailed,
  type SyncFailureAdapter,
  type SyncPolicyFailure,
} from "@agentxm/workspace-sync";

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
 * Translate a workspace-sync policy failure: the implementation chose the
 * category and wording at construction, so the envelope carries them over 1:1.
 */
export const workspaceSyncFailedToAppError = (error: WorkspaceSyncFailed): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Convert any sync-policy failure into the CLI-facing `AppError` envelope. */
export const syncFailureToAppError = (failure: SyncPolicyFailure | AppError): AppError =>
  failure instanceof WorkspaceSyncFailed
    ? workspaceSyncFailedToAppError(failure)
    : toAppError(failure);

/**
 * The sync feature's failure adapter: plan-step categories and details reuse
 * the boundary's own conversions so machine output stays byte-identical.
 */
export const syncStepFailureAdapter: SyncFailureAdapter = {
  toStepFailure: (failure) => appErrorToStepFailure(syncFailureToAppError(failure)),
};
