/**
 * Conversions from vertical-feature typed failures into the CLI-facing
 * `AppError` envelope. The shared `toAppError` dispatcher lives with the
 * extension-management residue and may not depend on feature packages, so the
 * application boundary owns these conversions directly.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { makeAppError, AppError } from "@agentxm/extension-management/unstable/app-error";
import {
  appErrorToStepFailure,
  isKnownFailure,
  toAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";
import {
  ExtensionLifecycleFailed,
  LifecycleFailureAdapter,
  type LifecycleFailureAdapterService,
} from "@agentxm/extension-lifecycle";
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

/**
 * Translate a lifecycle policy failure: the implementation chose the
 * category and wording at construction, so the envelope carries them over
 * 1:1 through the same normalization the envelope constructor applies.
 */
export const extensionLifecycleFailedToAppError = (error: ExtensionLifecycleFailed): AppError =>
  makeAppError({
    code: error.category,
    ...(error.title === undefined ? {} : { title: error.title }),
    ...(error.detail === undefined ? {} : { detail: error.detail }),
    ...(error.recover === undefined ? {} : { recover: error.recover }),
    ...(error.cmd === undefined ? {} : { cmd: error.cmd }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/**
 * Convert any failure a lifecycle use case can surface — the feature's own
 * typed failure, a known kernel or integration failure, or an envelope that
 * travelled through a still-coupled channel — into the CLI-facing `AppError`.
 */
export const lifecycleFailureToAppError = (failure: unknown): AppError => {
  if (failure instanceof ExtensionLifecycleFailed) {
    return extensionLifecycleFailedToAppError(failure);
  }
  if (failure instanceof AppError) return failure;
  if (isKnownFailure(failure)) return toAppError(failure);
  return makeAppError({ code: "internal", detail: String(failure), cause: failure });
};

/** Serialize any lifecycle failure into the plan-step vocabulary. */
export const lifecycleFailureToStepFailure = (failure: unknown) =>
  appErrorToStepFailure(lifecycleFailureToAppError(failure));

/**
 * The lifecycle feature's failure adapter: step categories, details, and
 * message text reuse the boundary's own conversions so plan data and machine
 * output stay byte-identical with rendered errors.
 */
export const lifecycleFailureAdapter: LifecycleFailureAdapterService = {
  toStepFailure: lifecycleFailureToStepFailure,
  describeFailure: (failure) => lifecycleFailureToAppError(failure).detail,
  describeFailureMessage: (failure) => lifecycleFailureToAppError(failure).message,
};

/** Layer wiring the boundary's failure conversions into lifecycle operations. */
export const LifecycleFailureAdapterLive = Layer.succeed(
  LifecycleFailureAdapter,
  lifecycleFailureAdapter,
);

/**
 * Supply the boundary's failure adapter to one lifecycle operation invoked
 * outside the shared runtime layer (handlers that build their own local
 * service environment).
 */
export const provideLifecycleFailureAdapter = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, LifecycleFailureAdapter>> =>
  Effect.provideService(effect, LifecycleFailureAdapter, lifecycleFailureAdapter);

/**
 * Convert only the lifecycle feature's own typed failure into the envelope,
 * leaving every other member of the channel untouched.
 */
export const coerceLifecycleFailure = <E>(failure: E | ExtensionLifecycleFailed): E | AppError =>
  failure instanceof ExtensionLifecycleFailed
    ? extensionLifecycleFailedToAppError(failure)
    : failure;
