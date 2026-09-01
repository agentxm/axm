/**
 * Typed failures for the registry-auth feature. The producer owns the
 * category choice and user-facing wording; the application boundary converts
 * the carried fields into its error envelope verbatim. Failures that carry a
 * registry transport failure keep it intact so the boundary can restore the
 * exact evidence, metadata, and semantics the former in-place conversion
 * produced.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import { isRegistryClientFailure, type RegistryClientFailure } from "@agentxm/registry-client";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

/** Every category a registry-auth failure can carry. Identical strings to the CLI error codes. */
export const REGISTRY_AUTH_ERROR_CATEGORIES = [
  "auth",
  "auth_denied",
  "auth_expired",
  "conflict",
  "internal",
  "not_found",
  "validation",
] as const;

export type RegistryAuthErrorCategory = (typeof REGISTRY_AUTH_ERROR_CATEGORIES)[number];

/**
 * An auth policy step could not proceed. The carried fields mirror the
 * application error envelope's inputs 1:1: `category` selects the code,
 * `recover`/`cmd` fold into the leading suggested action, and `detail`,
 * `suggestions`, and `cause` carry over verbatim.
 */
export class RegistryAuthFailed extends Data.TaggedError("RegistryAuthFailed")<{
  readonly category: RegistryAuthErrorCategory;
  readonly detail: string;
  readonly recover?: string;
  readonly cmd?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

/**
 * Sign-in is required and a person must approve it. The boundary renders the
 * fixed device-flow and token-creation guidance; the producer chooses only
 * the leading message.
 */
export class AuthLoginRequired extends Data.TaggedError("AuthLoginRequired")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const authLoginRequired = (
  message = "Authentication required",
  cause?: unknown,
): AuthLoginRequired =>
  new AuthLoginRequired({ message, ...(cause === undefined ? {} : { cause }) });

/**
 * Persisted credentials are unavailable by policy (for example in CI), so an
 * ambient token is the only accepted authentication. The boundary renders the
 * fixed AXM_TOKEN_FILE / token-creation guidance.
 */
export class AuthTokenPolicyRequired extends Data.TaggedError("AuthTokenPolicyRequired")<{
  readonly cause?: unknown;
}> {}

/** The device authorization was denied or cancelled by the person approving it. */
export class DeviceLoginDenied extends Data.TaggedError("DeviceLoginDenied") {}

/** The device authorization code expired before the person approved it. */
export class DeviceLoginCodeExpired extends Data.TaggedError("DeviceLoginCodeExpired") {}

/**
 * A bounded wait for device approval elapsed while the pending flow is still
 * valid. Carries every fact the boundary needs to render the pending-human
 * envelope: status, blocked-on semantics, the open-url action with fallback
 * and one-time code, and the resume command.
 */
export class DeviceAuthorizationPending extends Data.TaggedError("DeviceAuthorizationPending")<{
  readonly timeoutSeconds: number;
  readonly verificationUri: string;
  readonly verificationUriComplete: string;
  readonly userCode: string;
  /** ISO timestamp at which the pending device authorization expires. */
  readonly expiresAt: string;
  /** Exact command that resumes the pending sign-in. */
  readonly resume: string;
}> {}

/** One step-up verification request as the registry described it on the wire. */
export interface StepUpRequest {
  readonly requestId: string;
  readonly verificationUrl: string;
  readonly statusUrl: string;
  readonly expiresAt: string;
  readonly intervalSeconds: number;
  readonly maxAgeSeconds?: number;
  readonly action: string;
  readonly target: string;
}

/**
 * The registry demands step-up verification by a person before the operation
 * can proceed. Carries the parsed step-up request and the underlying
 * transport failure so the boundary reproduces the exact metadata and cause
 * evidence.
 */
export class StepUpRequired extends Data.TaggedError("StepUpRequired")<{
  readonly stepUp: StepUpRequest;
  readonly failure: RegistryClientFailure;
}> {}

/**
 * A token-exchange endpoint failed and the flow assigns it auth semantics:
 * the boundary overlays the carried detail and suggestions onto the mapped
 * transport failure exactly as the former in-place conversion did.
 */
export class AuthExchangeFailed extends Data.TaggedError("AuthExchangeFailed")<{
  readonly detail: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly failure: RegistryClientFailure;
}> {}

/** Every typed failure the registry-auth feature constructs. */
export type RegistryAuthFailure =
  | RegistryAuthFailed
  | AuthLoginRequired
  | AuthTokenPolicyRequired
  | DeviceLoginDenied
  | DeviceLoginCodeExpired
  | DeviceAuthorizationPending
  | StepUpRequired
  | AuthExchangeFailed;

export const isRegistryAuthFailure = (error: unknown): error is RegistryAuthFailure =>
  error instanceof RegistryAuthFailed ||
  error instanceof AuthLoginRequired ||
  error instanceof AuthTokenPolicyRequired ||
  error instanceof DeviceLoginDenied ||
  error instanceof DeviceLoginCodeExpired ||
  error instanceof DeviceAuthorizationPending ||
  error instanceof StepUpRequired ||
  error instanceof AuthExchangeFailed;

/**
 * Every failure a registry-auth use case can surface: the feature's own typed
 * failures plus registry transport failures propagated unwrapped.
 */
export type AuthError = RegistryAuthFailure | RegistryClientFailure;

export const isAuthError = (error: unknown): error is AuthError =>
  isRegistryAuthFailure(error) || isRegistryClientFailure(error);
