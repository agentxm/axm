/**
 * Conversions from vertical-feature typed failures into the CLI-facing
 * `AppError` envelope. The shared `toAppError` dispatcher lives with the
 * CLI-local app-error module and may not depend on feature packages, so the
 * application boundary owns these conversions directly.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  errAuthRequired,
  makeAppError,
  withAppErrorSemantics,
  AppError,
  type AppErrorCode,
} from "./app-error/index.js";
import { appErrorToStepFailure, isKnownFailure, toAppError } from "./app-error/conversions.js";
import {
  ExtensionLifecycleFailed,
  LifecycleFailureAdapter,
  type LifecycleFailureAdapterService,
} from "@agentxm/extension-lifecycle";
import {
  AuthoringFailed,
  AuthoringFailureAdapter,
  type AuthoringFailureAdapterService,
} from "@agentxm/extension-authoring";
import { PublishFailed } from "@agentxm/extension-publish";
import type { ExpectedCliError } from "./cli-runtime/index.js";
import {
  isRegistryAuthFailure,
  REGISTRY_AUTH_ERROR_CATEGORIES,
  type AuthExchangeFailed,
  type AuthLoginRequired,
  type AuthTokenPolicyRequired,
  type DeviceAuthorizationPending,
  type DeviceLoginCodeExpired,
  type DeviceLoginDenied,
  type RegistryAuthFailed,
  type RegistryAuthFailure,
  type StepUpRequired,
} from "@agentxm/registry-auth";
import type { LintStagingFailed } from "@agentxm/workspace-lint";
import {
  WorkspaceConfigurationFailed,
  WorkspaceInitializationCancelled,
} from "@agentxm/workspace-configuration";
import {
  InspectionFailureAdapter,
  WorkspaceInspectionFailed,
  type InspectionFailureAdapterService,
} from "@agentxm/workspace-inspection";
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
 * Translate a publish policy failure: the implementation chose the category
 * and wording at construction, so the envelope carries them over 1:1 through
 * the same normalization the envelope constructor applies.
 */
export const publishFailedToAppError = (error: PublishFailed): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.recover === undefined ? {} : { recover: error.recover }),
    ...(error.cmd === undefined ? {} : { cmd: error.cmd }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/**
 * Convert any failure a publish use case can surface — the feature's own
 * typed failure, a known kernel or integration failure, or an envelope that
 * travelled through a still-coupled channel — into the CLI-facing `AppError`.
 */
export const publishFailureToAppError = (failure: unknown): AppError => {
  if (failure instanceof PublishFailed) return publishFailedToAppError(failure);
  if (failure instanceof AppError) return failure;
  if (isKnownFailure(failure)) return toAppError(failure);
  return makeAppError({ code: "internal", detail: String(failure), cause: failure });
};

/**
 * Translate an authoring policy failure: the implementation chose the
 * category and wording at construction, so the envelope carries them over
 * 1:1 through the same normalization the envelope constructor applies.
 */
export const authoringFailedToAppError = (error: AuthoringFailed): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.recover === undefined ? {} : { recover: error.recover }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/**
 * Convert any failure an authoring operation can surface — the feature's own
 * typed failure, a known kernel failure, or an envelope that travelled
 * through a still-coupled channel — into the CLI-facing `AppError`.
 */
export const authoringFailureToAppError = (failure: unknown): AppError => {
  if (failure instanceof AuthoringFailed) return authoringFailedToAppError(failure);
  if (failure instanceof AppError) return failure;
  if (isKnownFailure(failure)) return toAppError(failure);
  return makeAppError({ code: "internal", detail: String(failure), cause: failure });
};

/** Serialize any authoring failure into the plan-step vocabulary. */
export const authoringFailureToStepFailure = (failure: unknown) =>
  appErrorToStepFailure(authoringFailureToAppError(failure));

/**
 * The authoring feature's failure adapter: step categories and details reuse
 * the boundary's own conversions so plan data and machine output stay
 * byte-identical with rendered errors.
 */
export const authoringFailureAdapter: AuthoringFailureAdapterService = {
  toStepFailure: authoringFailureToStepFailure,
};

/** Layer wiring the boundary's failure conversions into authoring operations. */
export const AuthoringFailureAdapterLive = Layer.succeed(
  AuthoringFailureAdapter,
  authoringFailureAdapter,
);

/**
 * Supply the boundary's failure adapter to one authoring operation invoked
 * outside the shared runtime layer (handlers that build their own local
 * service environment).
 */
export const provideAuthoringFailureAdapter = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, AuthoringFailureAdapter>> =>
  Effect.provideService(effect, AuthoringFailureAdapter, authoringFailureAdapter);

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

// The registry-auth category vocabulary and the CLI's AppErrorCode must stay
// the same strings; divergence is a compile error here, at the boundary that
// owns the mapping.
REGISTRY_AUTH_ERROR_CATEGORIES satisfies ReadonlyArray<AppErrorCode>;

/**
 * Translate a registry-auth policy failure: the implementation chose the
 * category and wording at construction, so the envelope carries them over
 * 1:1. A typed auth failure in cause position converts recursively so the
 * serialized cause chain matches the former in-place construction, where the
 * nested value was already an envelope.
 */
export const registryAuthFailedToAppError = (error: RegistryAuthFailed): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.recover === undefined ? {} : { recover: error.recover }),
    ...(error.cmd === undefined ? {} : { cmd: error.cmd }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined
      ? {}
      : {
          cause: isRegistryAuthFailure(error.cause)
            ? registryAuthFailureToAppError(error.cause)
            : error.cause,
        }),
  });

/** Sign-in required: the shared builder renders the fixed device-flow guidance. */
export const authLoginRequiredToAppError = (error: AuthLoginRequired): AppError =>
  errAuthRequired(error.message, error.cause);

/** Ambient-token-only policy: the former builder's envelope, verbatim. */
export const authTokenPolicyRequiredToAppError = (error: AuthTokenPolicyRequired): AppError =>
  makeAppError({
    code: "auth_required",
    detail: "No authentication token is available.",
    blockedOn: "human",
    suggestions: [
      {
        description:
          "Set AXM_TOKEN_FILE (preferred) or AXM_TOKEN for non-interactive authentication.",
      },
      {
        description: "Create a personal access token in AgentXM.ai.",
        url: "https://agentxm.ai/u/settings/tokens",
      },
    ],
    cause: error.cause,
  });

export const deviceLoginDeniedToAppError = (_error: DeviceLoginDenied): AppError =>
  makeAppError({
    code: "auth",
    detail: "Login was denied or cancelled",
    suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
  });

export const deviceLoginCodeExpiredToAppError = (_error: DeviceLoginCodeExpired): AppError =>
  makeAppError({
    code: "auth",
    detail: "Login code expired",
    suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
  });

/** A bounded device-approval wait elapsed: the pending-human envelope. */
export const deviceAuthorizationPendingToAppError = (error: DeviceAuthorizationPending): AppError =>
  makeAppError({
    code: "timeout",
    status: "pending-human",
    retryable: true,
    blockedOn: "human",
    action: {
      kind: "open-url",
      url: error.verificationUriComplete,
      fallbackUrl: error.verificationUri,
      code: error.userCode,
      expiresAt: error.expiresAt,
      resume: error.resume,
    },
    detail: `Device sign-in did not complete within ${error.timeoutSeconds} seconds. The pending flow is still available.`,
    suggestions: [
      { description: "Resume waiting after approval.", cmd: "axm login --wait --json" },
    ],
  });

/**
 * Step-up verification demanded: metadata and cause restore from the carried
 * transport failure, exactly as the former in-place construction read them
 * off the mapped envelope.
 */
export const stepUpRequiredToAppError = (error: StepUpRequired): AppError => {
  const mapped = toAppError(error.failure);
  return makeAppError({
    code: "auth_required",
    detail: "Step-up authentication is required",
    blockedOn: "human",
    action: {
      kind: "open-url",
      url: error.stepUp.verificationUrl,
      expiresAt: error.stepUp.expiresAt,
    },
    ...(mapped.metadata === undefined ? {} : { metadata: mapped.metadata }),
    recover: "Complete verification while the command is waiting, or rerun the command to restart.",
    cause: mapped.cause,
  });
};

/**
 * Token-exchange auth semantics: overlay the carried detail and suggestions
 * onto the mapped transport failure through the same semantics helper the
 * former in-place conversion used, preserving title, metadata, and cause.
 */
export const authExchangeFailedToAppError = (error: AuthExchangeFailed): AppError =>
  withAppErrorSemantics(toAppError(error.failure), {
    code: "auth",
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
  });

/** Convert any registry-auth typed failure into the CLI-facing envelope. */
export const registryAuthFailureToAppError = (failure: RegistryAuthFailure): AppError => {
  switch (failure._tag) {
    case "RegistryAuthFailed":
      return registryAuthFailedToAppError(failure);
    case "AuthLoginRequired":
      return authLoginRequiredToAppError(failure);
    case "AuthTokenPolicyRequired":
      return authTokenPolicyRequiredToAppError(failure);
    case "DeviceLoginDenied":
      return deviceLoginDeniedToAppError(failure);
    case "DeviceLoginCodeExpired":
      return deviceLoginCodeExpiredToAppError(failure);
    case "DeviceAuthorizationPending":
      return deviceAuthorizationPendingToAppError(failure);
    case "StepUpRequired":
      return stepUpRequiredToAppError(failure);
    case "AuthExchangeFailed":
      return authExchangeFailedToAppError(failure);
  }
};

/**
 * Convert only the registry-auth feature's own typed failures into the
 * envelope, leaving every other expected failure untouched. Concretely typed
 * so the auth members leave the channel instead of being reabsorbed by a
 * generic parameter.
 */
export const coerceAuthFailure = (
  failure: ExpectedCliError | RegistryAuthFailure,
): ExpectedCliError =>
  isRegistryAuthFailure(failure) ? registryAuthFailureToAppError(failure) : failure;

/**
 * Convert any failure an auth use case can surface — the feature's own typed
 * failures, a known registry transport failure, or an envelope that travelled
 * through a still-coupled channel — into the CLI-facing `AppError`.
 */
export const authFailureToAppError = (failure: unknown): AppError => {
  if (isRegistryAuthFailure(failure)) return registryAuthFailureToAppError(failure);
  if (failure instanceof AppError) return failure;
  if (isKnownFailure(failure)) return toAppError(failure);
  return makeAppError({ code: "internal", detail: String(failure), cause: failure });
};

/**
 * Translate a workspace-configuration policy failure: the implementation
 * chose the category and wording at construction, so the envelope carries
 * them over 1:1 through the same normalization the envelope constructor
 * applies.
 */
export const workspaceConfigurationFailedToAppError = (
  error: WorkspaceConfigurationFailed,
): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.recover === undefined ? {} : { recover: error.recover }),
    ...(error.cmd === undefined ? {} : { cmd: error.cmd }),
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/**
 * Convert any failure a workspace-configuration flow can surface — the
 * feature's own typed failure, a known kernel or integration failure, or an
 * envelope that travelled through a still-coupled channel — into the
 * CLI-facing `AppError`.
 */
export const configurationFailureToAppError = (failure: unknown): AppError => {
  if (failure instanceof WorkspaceConfigurationFailed) {
    return workspaceConfigurationFailedToAppError(failure);
  }
  if (failure instanceof AppError) return failure;
  if (isKnownFailure(failure)) return toAppError(failure);
  return makeAppError({ code: "internal", detail: String(failure), cause: failure });
};

/**
 * Convert configuration failures into the envelope while letting the typed
 * initialization cancellation pass through to the runtime envelope's silent
 * success exit.
 */
export const coerceConfigurationFailure = (failure: unknown): ExpectedCliError =>
  failure instanceof WorkspaceInitializationCancelled
    ? failure
    : configurationFailureToAppError(failure);

/** Serialize any configuration failure into the plan-step vocabulary. */
export const configurationFailureToStepFailure = (failure: unknown) =>
  appErrorToStepFailure(configurationFailureToAppError(failure));

/**
 * Translate a workspace-inspection query failure: the implementation chose
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
 * Convert any failure a workspace-inspection query can surface — the
 * feature's own typed failure, a known kernel or integration failure, or an
 * envelope that travelled through a still-coupled channel — into the
 * CLI-facing `AppError`.
 */
export const inspectionFailureToAppError = (failure: unknown): AppError => {
  if (failure instanceof WorkspaceInspectionFailed) {
    return workspaceInspectionFailedToAppError(failure);
  }
  if (failure instanceof AppError) return failure;
  if (isKnownFailure(failure)) return toAppError(failure);
  return makeAppError({ code: "internal", detail: String(failure), cause: failure });
};

/**
 * The inspection feature's failure adapter: assessment reasons reuse the
 * boundary's own conversions so diagnostic sentences inside inspection
 * results stay byte-identical with rendered errors.
 */
export const inspectionFailureAdapter: InspectionFailureAdapterService = {
  describeFailure: (failure) => inspectionFailureToAppError(failure).detail,
};

/** Layer wiring the boundary's failure conversions into inspection queries. */
export const InspectionFailureAdapterLive = Layer.succeed(
  InspectionFailureAdapter,
  inspectionFailureAdapter,
);
