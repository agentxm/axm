/**
 * Granular access-token policy: the public vocabulary a token is described in,
 * the expiry grammar and its bounds, and the human verification that creating
 * a credential asks for.
 *
 * A token is narrowed by one permission level, an optional allowlist of owners
 * and extensions, and an expiry. Scope strings are the Registry's internal
 * representation and never reach a person here.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  isRegistryClientFailure,
  withRegistrySemantics,
  type RegistryClientFailure,
} from "@agentxm/registry-client";

import {
  AuthClient,
  type CreatedTokenResponse,
  type TokenPermissionsRequest,
} from "./auth-client.js";
import { CredentialStore } from "../credentials/credential-store.js";
import { RegistryAccessFailed, type AuthError } from "./errors.js";
import { AuthLoginPresenter } from "./login-presenter.js";
import { requireSignedIn } from "./identity.js";
import { runWithStepUp, type StepUpOptions } from "./step-up.js";
import { maxTokenLifetimeSeconds, type TokenPermissionLevel } from "./tokens/permissions.js";

/** A token may live no less than an hour. Its ceiling depends on what it can do. */
export const MIN_TOKEN_LIFETIME_SECONDS = 3_600;

/** The authority a new token carries. */
export interface TokenAuthorityRequest {
  readonly owners: ReadonlyArray<string>;
  readonly extensions: ReadonlyArray<string>;
  readonly permission: TokenPermissionLevel;
}

export interface CreateTokenRequest extends TokenAuthorityRequest {
  readonly name: string;
  /** Relative lifetime (`7d`, `30d`, `1y`) or an absolute ISO timestamp. */
  readonly expires: string;
  readonly verification: StepUpOptions;
}

export interface CreatedToken {
  readonly token: CreatedTokenResponse;
  readonly stepUpCompleted: boolean;
}

const invalid = (detail: string) => new RegistryAccessFailed({ category: "validation", detail });

/**
 * Read the requested lifetime. Relative forms are exact multiples; an
 * absolute timestamp becomes the distance from now.
 */
export const parseExpiresInSeconds = (raw: string): Effect.Effect<number, RegistryAccessFailed> => {
  const trimmed = raw.trim();
  const relative = /^(\d+)([hdy])$/.exec(trimmed);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const multiplier = unit === "h" ? 3_600 : unit === "d" ? 86_400 : 31_536_000;
    return Effect.succeed(amount * multiplier);
  }
  return Option.match(DateTime.make(trimmed), {
    onNone: () =>
      Effect.fail(invalid("Invalid --expires value. Use 7d, 30d, 1y, or an ISO timestamp.")),
    onSome: (expiry) =>
      Effect.map(DateTime.now, (now) =>
        Math.floor(Duration.toSeconds(DateTime.distance(now, expiry))),
      ),
  });
};

/**
 * Enforce the accepted lifetime window. A token that can change the registry is
 * worth more than one that can only read it, so the two do not share a ceiling.
 */
export const validateExpiresInSeconds = (
  expiresIn: number,
  permission: TokenPermissionLevel,
): Effect.Effect<number, RegistryAccessFailed> => {
  const maximum = maxTokenLifetimeSeconds(permission);
  return expiresIn < MIN_TOKEN_LIFETIME_SECONDS || expiresIn > maximum
    ? Effect.fail(
        invalid(
          permission === "read"
            ? "Token expiry must be between 1 hour and 365 days."
            : "A token that can publish or administer extensions must expire within 90 days.",
        ),
      )
    : Effect.succeed(expiresIn);
};

/** Only the authority a caller actually asked for reaches the Registry. */
export const tokenPermissions = (request: TokenAuthorityRequest): TokenPermissionsRequest => ({
  ...(request.owners.length > 0 ? { owners: request.owners } : {}),
  ...(request.extensions.length > 0 ? { extensions: request.extensions } : {}),
  permission: request.permission,
});

/**
 * Whether the Registry definitively refused a creation. Only a client-error
 * answer, or input that never left this process, proves no token was minted;
 * 408 is a timeout in either direction and proves nothing.
 */
const registryRefusedCreation = (error: RegistryClientFailure): boolean => {
  const status = error.metadata?.response?.status;
  return (
    error.category === "validation" ||
    (status !== undefined && status >= 400 && status < 500 && status !== 408)
  );
};

/**
 * A creation the Registry did not definitively refuse may still have minted a
 * token — a lost connection, an unreadable answer, or a gateway or server
 * error all leave that open — and a name does not identify one. The failure
 * keeps its evidence but says so, and never invites a blind retry.
 */
const reportUncertainIssuance =
  (name: string) =>
  (error: AuthError): AuthError =>
    isRegistryClientFailure(error) && !registryRefusedCreation(error)
      ? withRegistrySemantics(error, {
          detail: `AXM did not receive a definitive answer from the Registry to creating token "${name}", so it may or may not exist. Review your tokens before creating another, and revoke an unwanted one by its ID.`,
          suggestions: [
            { description: "Review existing tokens", cmd: "axm token list" },
            { description: "Revoke an unwanted token by ID", cmd: "axm token revoke <id>" },
          ],
        })
      : error;

export const createToken = Effect.fn("Tokens.create")(function* (
  request: CreateTokenRequest,
  registryUrl: string,
) {
  const authClient = yield* AuthClient;
  yield* requireSignedIn(registryUrl);
  const expiresIn = yield* parseExpiresInSeconds(request.expires).pipe(
    Effect.flatMap((seconds) => validateExpiresInSeconds(seconds, request.permission)),
  );
  const created = yield* runWithStepUp(
    (stepUpRequestId) =>
      authClient
        .createToken(
          { name: request.name, expiresIn, permissions: tokenPermissions(request) },
          stepUpRequestId === undefined ? undefined : { stepUpRequestId },
        )
        .pipe(Effect.mapError(reportUncertainIssuance(request.name))),
    {
      operationLabel: `Create registry token "${request.name}"`,
    },
    request.verification,
    registryUrl,
  );
  return { token: created.value, stepUpCompleted: created.stepUpCompleted } satisfies CreatedToken;
});

/**
 * Revoking a token takes authority away, so a signed-in person simply does it:
 * nothing here asks them to prove themselves again.
 */
export const revokeToken = Effect.fn("Tokens.revoke")(function* (
  tokenId: string,
  registryUrl: string,
) {
  const authClient = yield* AuthClient;
  yield* requireSignedIn(registryUrl);
  yield* authClient.deleteToken(tokenId);
  return { tokenId };
});

export const listTokens = Effect.fn("Tokens.list")(function* (registryUrl: string) {
  const authClient = yield* AuthClient;
  const presenter = yield* AuthLoginPresenter;
  yield* requireSignedIn(registryUrl);
  return yield* presenter.withProgress({ _tag: "ListingRegistryTokens" }, () =>
    authClient.listTokens(),
  );
});

/** Declared for the reader; every member keeps these in `R`. */
export type TokenRequirements = AuthClient | CredentialStore | AuthLoginPresenter;
