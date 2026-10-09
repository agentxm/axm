/**
 * Typed failures for the Registry access capability. The producer owns the
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

/** Every category a registry-access failure can carry. Identical strings to the CLI error codes. */
export const REGISTRY_ACCESS_ERROR_CATEGORIES = [
  "auth",
  "auth_denied",
  "auth_expired",
  "conflict",
  "internal",
  "not_found",
  "timeout",
  "usage",
  "validation",
] as const;

export type RegistryAccessErrorCategory = (typeof REGISTRY_ACCESS_ERROR_CATEGORIES)[number];

/**
 * An auth policy step could not proceed. The carried fields mirror the
 * application error envelope's inputs 1:1: `category` selects the code,
 * `recover`/`cmd` fold into the leading suggested action, and `detail`,
 * `suggestions`, and `cause` carry over verbatim.
 */
export class RegistryAccessFailed extends Data.TaggedError("RegistryAccessFailed")<{
  readonly category: RegistryAccessErrorCategory;
  readonly detail: string;
  readonly recover?: string;
  readonly cmd?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

/**
 * Signed out: the invocation carries no credential the Registry accepts.
 *
 * This is one of the two states a person can be in, so it is one failure with
 * one rendering. Nothing else may report being signed out, and no refusal that
 * a signed-in person can hit may borrow it.
 */
export class SignedOut extends Data.TaggedError("SignedOut")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const signedOut = (cause?: unknown, message = "You are not signed in."): SignedOut =>
  new SignedOut({ message, ...(cause === undefined ? {} : { cause }) });

/**
 * Persisted credentials are unavailable by policy (for example in CI), so an
 * ambient token is the only accepted authentication. The boundary renders the
 * fixed AXM_TOKEN_FILE / token-creation guidance.
 */
export class AuthTokenPolicyRequired extends Data.TaggedError("AuthTokenPolicyRequired")<{
  readonly cause?: unknown;
}> {}

/**
 * The Registry ended this session: it refused the stored refresh token, so no
 * credential remains to renew. The only recovery is signing in again. It is
 * the session refresher's answer to the transport, which leaves the request to
 * be rejected by the Registry; no feature receives it.
 */
export class SessionEnded extends Data.TaggedError("SessionEnded")<{
  readonly registryUrl: string;
  readonly cause?: unknown;
}> {}

/**
 * The session could not be renewed right now and is still valid as far as
 * anyone knows: nothing that speaks for the refresh grant answered. The
 * credential is kept and the invocation is worth retrying. The transport
 * carries it to a feature as a network failure of the request it was renewing
 * for.
 */
export class RefreshUnavailable extends Data.TaggedError("RefreshUnavailable")<{
  readonly registryUrl: string;
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** Where a person registers a repository's workflow as a trusted publisher. */
export const TRUSTED_PUBLISHER_SETTINGS_URL = "https://agentxm.ai/u/settings/trusted-publishers";

/** Why a GitHub Actions identity could not become a Registry credential. */
export type WorkloadTokenUnavailableReason =
  "id_token_request_failed" | "exchange_refused" | "exchange_unavailable";

/**
 * The invocation runs in a GitHub Actions job that offers an ID token, and that
 * identity could not be exchanged for a workload token. The producer owns the
 * wording, so the failure reads the same whether a command asked for the
 * credential or the transport did.
 */
export class WorkloadTokenUnavailable extends Data.TaggedError("WorkloadTokenUnavailable")<{
  readonly reason: WorkloadTokenUnavailableReason;
  readonly registryUrl: string;
  readonly detail: string;
  readonly suggestions: ReadonlyArray<SuggestedAction>;
  readonly cause?: unknown;
}> {}

const WORKLOAD_TOKEN_UNAVAILABLE_DETAIL: Record<WorkloadTokenUnavailableReason, string> = {
  id_token_request_failed:
    "GitHub Actions did not issue an ID token for this job, so it cannot authenticate as a trusted publisher.",
  exchange_refused:
    "The Registry refused this job's GitHub Actions identity: no active trusted publisher matches its repository, workflow, and environment.",
  exchange_unavailable:
    "The Registry could not be reached to exchange this job's GitHub Actions identity for a token.",
};

const WORKLOAD_TOKEN_SUGGESTIONS: ReadonlyArray<SuggestedAction> = [
  {
    description:
      "Add `id-token` with `write` access to the job's `permissions` so it can request a GitHub Actions ID token.",
  },
  {
    description:
      "Register this repository and workflow as a trusted publisher in AgentXM settings.",
    url: TRUSTED_PUBLISHER_SETTINGS_URL,
  },
  {
    description:
      "To authenticate with a token instead, set AXM_TOKEN_FILE, or set AXM_TRUSTED_PUBLISHING=0 to stop using this job's identity.",
  },
];

export const workloadTokenUnavailable = (
  reason: WorkloadTokenUnavailableReason,
  registryUrl: string,
  cause?: unknown,
): WorkloadTokenUnavailable =>
  new WorkloadTokenUnavailable({
    reason,
    registryUrl,
    detail: WORKLOAD_TOKEN_UNAVAILABLE_DETAIL[reason],
    suggestions:
      reason === "exchange_unavailable"
        ? [{ description: "Retry once the Registry is reachable." }, ...WORKLOAD_TOKEN_SUGGESTIONS]
        : WORKLOAD_TOKEN_SUGGESTIONS,
    ...(cause === undefined ? {} : { cause }),
  });

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
/**
 * How the terminal stopped waiting on a person: its bounded wait elapsed, or
 * the person stopped it. Neither touches the authorization it parked on.
 */
export type DeviceWaitEnded =
  { readonly _tag: "Elapsed"; readonly seconds: number } | { readonly _tag: "Stopped" };

export class DeviceAuthorizationPending extends Data.TaggedError("DeviceAuthorizationPending")<{
  readonly waitEnded: DeviceWaitEnded;
  /** Whole minutes the pending code was still good for when the wait ended; at least one. */
  readonly minutesLeft: number;
  readonly registryUrl: string;
  readonly intervalSeconds: number;
  readonly verificationUri: string;
  readonly verificationUriComplete: string;
  readonly userCode: string;
  /** ISO timestamp at which the pending device authorization expires. */
  readonly expiresAt: string;
  /** Exact command that resumes the pending sign-in. */
  readonly resume: string;
}> {}

/**
 * A token-exchange endpoint failed and the flow assigns it auth semantics:
 * the boundary overlays the carried detail and suggestions onto the mapped
 * transport failure exactly as the former in-place conversion did.
 */
export class AuthExchangeFailed extends Data.TaggedError("AuthExchangeFailed")<{
  readonly detail: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly cause: RegistryClientFailure;
}> {}

/**
 * A person abandoned an auth interaction the capability asked the application
 * to run (declining is not abandoning: it returns a decision).
 */
export class AuthInteractionAbandoned extends Data.TaggedError("AuthInteractionAbandoned")<{
  readonly message: string;
}> {}

/** Every typed failure the Registry access capability constructs. */
export type RegistryAccessFailure =
  | RegistryAccessFailed
  | SignedOut
  | AuthTokenPolicyRequired
  | DeviceLoginDenied
  | DeviceLoginCodeExpired
  | DeviceAuthorizationPending
  | AuthInteractionAbandoned
  | AuthExchangeFailed
  | WorkloadTokenUnavailable;

export const isRegistryAccessFailure = (error: unknown): error is RegistryAccessFailure =>
  error instanceof RegistryAccessFailed ||
  error instanceof SignedOut ||
  error instanceof AuthTokenPolicyRequired ||
  error instanceof DeviceLoginDenied ||
  error instanceof DeviceLoginCodeExpired ||
  error instanceof DeviceAuthorizationPending ||
  error instanceof AuthInteractionAbandoned ||
  error instanceof AuthExchangeFailed ||
  error instanceof WorkloadTokenUnavailable;

/**
 * Every failure a Registry access use case can surface: the capability's typed
 * failures plus registry transport failures propagated unwrapped.
 */
export type AuthError = RegistryAccessFailure | RegistryClientFailure;

/**
 * Whether the Registry rejected the credential a request presented. A request
 * that carried a stored session has been through renewal by then, so this is
 * the Registry saying the person is signed out — not that it was unreachable,
 * and not that the person lacks a permission.
 */
export const isRejectedCredential = (error: unknown): boolean =>
  isRegistryClientFailure(error) && error.metadata?.response?.status === 401;

export const isAuthError = (error: unknown): error is AuthError =>
  isRegistryAccessFailure(error) || isRegistryClientFailure(error);
