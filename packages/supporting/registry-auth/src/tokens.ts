/**
 * Granular access-token policy: the expiry grammar and its bounds, the
 * permission payload the Registry accepts, and the human-verification
 * requirement on every token write.
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
import { CredentialStore } from "./credential-store.js";
import { RegistryAuthFailed } from "./errors.js";
import { AuthLoginPresenter } from "./login-presenter.js";
import { currentToken } from "./identity.js";
import { runWithStepUp, type StepUpOptions } from "./step-up.js";

/** A token may live no less than an hour and no more than a year. */
export const MIN_TOKEN_LIFETIME_SECONDS = 3_600;
export const MAX_TOKEN_LIFETIME_SECONDS = 31_536_000;

/** The authority a new token carries. */
export interface TokenAuthorityRequest {
  readonly owners: ReadonlyArray<string>;
  readonly extensions: ReadonlyArray<string>;
  readonly permission: Option.Option<"read" | "publish" | "admin">;
  readonly orgPermission: Option.Option<"read" | "write" | "admin">;
  readonly cidr: ReadonlyArray<string>;
  readonly bypassMfa: boolean;
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

const invalid = (detail: string) => new RegistryAuthFailed({ category: "validation", detail });

/**
 * Read the requested lifetime. Relative forms are exact multiples; an
 * absolute timestamp becomes the distance from now.
 */
export const parseExpiresInSeconds = (raw: string): Effect.Effect<number, RegistryAuthFailed> => {
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

/** Enforce the accepted lifetime window. */
export const validateExpiresInSeconds = (
  expiresIn: number,
): Effect.Effect<number, RegistryAuthFailed> =>
  expiresIn < MIN_TOKEN_LIFETIME_SECONDS || expiresIn > MAX_TOKEN_LIFETIME_SECONDS
    ? Effect.fail(invalid("Token expiry must be between 1 hour and 365 days."))
    : Effect.succeed(expiresIn);

/** Only the authority a caller actually asked for reaches the Registry. */
export const tokenPermissions = (request: TokenAuthorityRequest): TokenPermissionsRequest => ({
  ...(request.owners.length > 0 ? { owners: request.owners } : {}),
  ...(request.extensions.length > 0 ? { extensions: request.extensions } : {}),
  ...(Option.isSome(request.permission) ? { permission: request.permission.value } : {}),
  ...(Option.isSome(request.orgPermission) ? { org_permission: request.orgPermission.value } : {}),
  ...(request.cidr.length > 0 ? { cidr: request.cidr } : {}),
  ...(request.bypassMfa ? { bypass_mfa: true } : {}),
});

export const createToken = Effect.fn("Tokens.create")(function* (
  request: CreateTokenRequest,
  registryUrl: string,
) {
  const authClient = yield* AuthClient;
  const token = yield* currentToken(registryUrl);
  const expiresIn = yield* parseExpiresInSeconds(request.expires).pipe(
    Effect.flatMap(validateExpiresInSeconds),
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
