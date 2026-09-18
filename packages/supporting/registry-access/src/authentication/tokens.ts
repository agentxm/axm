/**
 * Granular access-token policy: the public vocabulary a token is described in,
 * the expiry grammar and its bounds, and the human-verification requirement on
 * every token write.
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
  AuthClient,
  type CreatedTokenResponse,
  type TokenPermissionsRequest,
} from "./auth-client.js";
import { CredentialStore } from "../credentials/credential-store.js";
import { RegistryAccessFailed } from "./errors.js";
import { AuthLoginPresenter } from "./login-presenter.js";
import { currentToken } from "./identity.js";
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

export const createToken = Effect.fn("Tokens.create")(function* (
  request: CreateTokenRequest,
  registryUrl: string,
) {
  const authClient = yield* AuthClient;
  const token = yield* currentToken(registryUrl);
  const expiresIn = yield* parseExpiresInSeconds(request.expires).pipe(
    Effect.flatMap((seconds) => validateExpiresInSeconds(seconds, request.permission)),
  );
  const created = yield* runWithStepUp(
    (stepUpRequestId) =>
      authClient.createToken(
        token,
        { name: request.name, expiresIn, permissions: tokenPermissions(request) },
        stepUpRequestId === undefined ? undefined : { stepUpRequestId },
      ),
    {
      operationLabel: `Create registry token "${request.name}"`,
      waitingLabel: `verification to create registry token "${request.name}"`,
    },
    request.verification,
    registryUrl,
  );
  return { token: created.value, stepUpCompleted: created.stepUpCompleted } satisfies CreatedToken;
});

export const revokeToken = Effect.fn("Tokens.revoke")(function* (
  tokenId: string,
  verification: StepUpOptions,
  registryUrl: string,
) {
  const authClient = yield* AuthClient;
  const token = yield* currentToken(registryUrl);
  const revoked = yield* runWithStepUp(
    (stepUpRequestId) =>
      authClient.deleteToken(
        token,
        tokenId,
        stepUpRequestId === undefined ? undefined : { stepUpRequestId },
      ),
    {
      operationLabel: `Revoke registry token ${tokenId}`,
      waitingLabel: `verification to revoke token ${tokenId}`,
    },
    verification,
    registryUrl,
  );
  return { tokenId, stepUpCompleted: revoked.stepUpCompleted };
});

export const listTokens = Effect.fn("Tokens.list")(function* (registryUrl: string) {
  const authClient = yield* AuthClient;
  const presenter = yield* AuthLoginPresenter;
  const token = yield* currentToken(registryUrl);
  return yield* presenter.withProgress({ _tag: "ListingRegistryTokens" }, () =>
    authClient.listTokens(token),
  );
});

/** Declared for the reader; every member keeps these in `R`. */
export type TokenRequirements = AuthClient | CredentialStore | AuthLoginPresenter;
