// @effect-diagnostics anyUnknownInErrorContext:off — HTTP schema/status errors remain opaque only inside this translating adapter
/**
 * AuthClient Effect service — device flow login, token refresh, revocation, identity queries.
 *
 * Provides methods for the OAuth 2.0 Device Authorization Grant (RFC 8628)
 * and related auth operations against the AgentXM registry API.
 *
 * Uses the generated registry client for HTTP transport and surfaces typed
 * auth and registry failures; the application boundary owns envelope
 * rendering.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import { normalizeHandle, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { type NormalizedTokenResponse } from "./oauth-contract.js";
import {
  GeneratedRegistryClient,
  RegistryRequestFailed,
  RegistryUrl,
  captureRegistryErrorResponseBodies,
  getString,
  isHttpClientError,
  isRegistryClientError,
  isRegistryClientFailure,
  isSchemaError,
  isTransientRegistryError,
  mapRegistryFailure,
  retainedRegistryResponseBody,
  type RegistryClientFailure,
} from "@agentxm/registry-client";
import {
  AuthExchangeFailed,
  DeviceLoginCodeExpired,
  DeviceLoginDenied,
  RefreshUnavailable,
  RegistryAccessFailed,
  SessionEnded,
  type AuthError,
} from "./errors.js";
import { readTokenPermissions, type TokenPermissions } from "./tokens/permissions.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CLIENT_ID = "axm-cli";
/**
 * The OIDC scopes every sign-in asks for. They name the identity claims and
 * the refresh grant the flow needs, and nothing a person can do: a signed-in
 * session is limited only by their permissions, so there is no registry scope
 * to request and no caller may vary this list.
 */
export const LOGIN_SCOPE = ["openid", "profile", "email", "offline_access"].join(" ");
/** Skew before expiry at which a session is renewed rather than spent. */
export const REFRESH_SKEW_SECONDS = 300;
const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const AUTHORIZATION_CODE_GRANT_TYPE = "authorization_code";
const SLOW_DOWN_INCREMENT_MS = 5000;
const TRANSIENT_DEVICE_POLL_RETRY_COUNT = 2;
const TRANSIENT_DEVICE_POLL_RETRY_BASE_DELAY = "250 millis";

// -----------------------------------------------------------------------------
// Response types
// -----------------------------------------------------------------------------

export interface DeviceFlowResponse {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri: string;
  readonly verification_uri_complete: string;
  readonly interval: number;
  readonly expires_in: number;
}

export interface MeResponse {
  readonly userHandle: Handle;
  readonly tokenType: string;
  /**
   * `account` means the credential carries the whole account's authority and
   * nothing narrows it. `limited` means its holder made it narrower than
   * themselves, and the limits below say how.
   */
  readonly authority: "account" | "limited";
  /** What a limited credential may do, in the token vocabulary. Null otherwise. */
  readonly permissions: TokenPermissions | null;
  readonly resourceRestrictions: { readonly extensions: ReadonlyArray<string> | null } | null;
  readonly expiresAt: DateTime.Utc | null;
  /**
   * When the browser sign-in that approved this CLI session authenticated.
   * Null for every other kind of credential.
   */
  readonly approvedAt: DateTime.Utc | null;
}

export interface TokenPermissionsRequest {
  readonly owners?: ReadonlyArray<string>;
  readonly extensions?: ReadonlyArray<string>;
  readonly permission: "read" | "publish" | "admin";
}

export interface CreateTokenParams {
  readonly name: string;
  readonly expiresIn: number;
  readonly permissions: TokenPermissionsRequest;
}

export interface CreatedTokenResponse {
  readonly id: string;
  readonly token: string;
  readonly name: string;
  readonly permissions: unknown;
  readonly createdAt: DateTime.Utc;
  readonly expiresAt: DateTime.Utc;
}

export interface TokenListItem {
  readonly id: string;
  readonly name: string | null;
  readonly type: string;
  readonly permissions: unknown;
  readonly createdAt: DateTime.Utc;
  readonly expiresAt: DateTime.Utc;
  readonly lastUsedAt: DateTime.Utc | null;
}

export interface TokenListResponse {
  readonly tokens: ReadonlyArray<TokenListItem>;
  readonly hasMore: boolean;
  readonly cursor: string | null;
}

export interface BuildAuthorizeUrlParams {
  readonly challenge: string;
  readonly expiresAt?: DateTime.Utc;
  readonly state: string;
  readonly redirectUri: string;
}

export interface ExchangePkceCodeParams {
  readonly code: string;
  readonly verifier: string;
  readonly redirectUri: string;
}

// -----------------------------------------------------------------------------
// Polling state (for testability)
// -----------------------------------------------------------------------------

/** Result of a single poll iteration. */
export type PollResult =
  | { readonly _tag: "Pending" }
  | { readonly _tag: "SlowDown" }
  | { readonly _tag: "Success"; readonly token: NormalizedTokenResponse }
  | { readonly _tag: "AccessDenied" }
  | { readonly _tag: "ExpiredToken" };

// -----------------------------------------------------------------------------
// Service interface
// -----------------------------------------------------------------------------

export interface AuthClientService {
  readonly buildAuthorizeUrl: (params: BuildAuthorizeUrlParams) => string;
  readonly getAuthorizationIssuer: () => string;
  readonly exchangePkceCode: (
    params: ExchangePkceCodeParams,
  ) => Effect.Effect<NormalizedTokenResponse, AuthError>;
  readonly initiateDeviceFlow: () => Effect.Effect<DeviceFlowResponse, AuthError>;
  readonly pollDeviceToken: (
    deviceCode: string,
    interval: number,
  ) => Effect.Effect<NormalizedTokenResponse, AuthError>;
  /**
   * Read the credential's identity. The transport carries the caller's
   * credential, so only a flow holding a token the store has not persisted yet
   * — a just-issued sign-in — names one.
   */
  readonly getMe: (accessToken?: string) => Effect.Effect<MeResponse, AuthError>;
  readonly createToken: (
    params: CreateTokenParams,
  ) => Effect.Effect<CreatedTokenResponse, AuthError>;
  readonly listTokens: (params?: {
    readonly limit?: number;
    readonly cursor?: string;
  }) => Effect.Effect<TokenListResponse, AuthError>;
  readonly deleteToken: (tokenId: string) => Effect.Effect<void, AuthError>;
}

export class AuthClient extends ServiceMap.Service<AuthClient, AuthClientService>()(
  "@agentxm/registry-access/auth-client/AuthClient",
) {}

/**
 * The OAuth endpoints that renew and end a stored session.
 *
 * It is a separate service from `AuthClient` because these are the calls that
 * must not travel through the authenticated transport. The middleware asks for
 * a renewed session while it is deciding what credential a request carries, so
 * a refresh that went back through it would not terminate, and a revoke that
 * did would renew the session it is ending. Both endpoints authenticate the
 * token in the request body, never a bearer. The refresh grant carries its own
 * failure vocabulary because the refresher acts on the difference between a
 * session the Registry ended and one it could not reach.
 */
export interface TokenExchangeService {
  readonly refreshToken: (
    refreshTokenValue: string,
    registryUrl: string,
  ) => Effect.Effect<
    NormalizedTokenResponse,
    SessionEnded | RefreshUnavailable | RegistryAccessFailed
  >;
  /** Revoke a refresh token and, with it, the session it belongs to. */
  readonly revokeToken: (
    refreshTokenValue: string,
    registryUrl: string,
  ) => Effect.Effect<void, RegistryClientFailure>;
}

export class TokenExchange extends ServiceMap.Service<TokenExchange, TokenExchangeService>()(
  "@agentxm/registry-access/auth-client/TokenExchange",
) {}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

class RetryableDevicePollError extends Data.TaggedError("RetryableDevicePollError")<{
  readonly cause: unknown;
}> {}

class OAuthTokenResponseError extends Data.TaggedError("OAuthTokenResponseError")<{
  readonly oauthCode?: string;
  readonly cause: unknown;
  readonly retryable: boolean;
}> {}

/** Normalize a generated token response to our domain NormalizedTokenResponse. */
const normalizeTokenResponse = (token: {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: DateTime.Utc;
}): NormalizedTokenResponse => ({
  access_token: token.access_token,
  refresh_token: token.refresh_token,
  expires_at: token.expires_at,
});

const SessionTokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_at: DateTimeUtcSchema,
});

const deriveAuthorizationOrigin = (registryUrl: string): string => {
  const url = new URL(registryUrl);
  if (url.origin === "https://registry.agentxm.ai") {
    return "https://agentxm.ai";
  }
  if (url.origin === "https://registry-dev.agentxm.ai") {
    return "https://web-dev.agentxm.ai";
  }
  const localHosts = ["localhost", "127.0.0.1", "[::1]"];
  const registryPort = Number(url.port);
  if (
    localHosts.some((host) => host === url.hostname) &&
    Number.isInteger(registryPort) &&
    registryPort >= 4300 &&
    registryPort <= 4399
  ) {
    return `${url.protocol}//${url.hostname}:${String(registryPort - 100)}`;
  }
  return url.origin;
};

const getOAuthErrorCode = (error: unknown): string | undefined =>
  getString(error, "error") ?? getString(error, "code");

const isRetryableDevicePollError = (
  error: AuthError | RetryableDevicePollError,
): error is RetryableDevicePollError => error._tag === "RetryableDevicePollError";

const registryAccessFailure = (
  registryUrl: string,
  operation: string,
  error: unknown,
): RegistryClientFailure =>
  isRegistryClientFailure(error)
    ? error
    : mapRegistryFailure(error, {
        baseUrl: registryUrl,
        networkDetail: `${operation}: the Registry could not be reached.`,
        incompatibleDetail: `${operation}: the Registry response does not match the expected contract.`,
        requestConstructionDetail: `${operation}: the Registry request could not be constructed.`,
        fallbackDetail: operation,
      });

const mapRegistryAccessError = (
  registryUrl: string,
  operation: string,
  error: unknown,
): RegistryClientFailure => registryAccessFailure(registryUrl, operation, error);

const makeGeneratedAuthClient = (
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  accessToken?: string,
) => {
  const remoteHttpClient = httpClient.pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl)),
  );
  return GeneratedRegistryClient.make(
    captureRegistryErrorResponseBodies(
      accessToken === undefined
        ? remoteHttpClient
        : remoteHttpClient.pipe(HttpClient.mapRequest(HttpClientRequest.bearerToken(accessToken))),
    ),
  );
};

/**
 * Retry transient device-poll failures with exponential backoff, capped at
 * TRANSIENT_DEVICE_POLL_RETRY_COUNT attempts. Non-retryable failures bypass
 * the retry via the `while` predicate, and any RetryableDevicePollError that
 * survives retry exhaustion is translated to a typed registry failure.
 */
const retryTransientDevicePollFailure = <A>(
  registryUrl: string,
  effect: Effect.Effect<A, AuthError | RetryableDevicePollError>,
): Effect.Effect<A, AuthError> =>
  effect.pipe(
    Effect.retry({
      times: TRANSIENT_DEVICE_POLL_RETRY_COUNT,
      schedule: Schedule.exponential(TRANSIENT_DEVICE_POLL_RETRY_BASE_DELAY),
      while: isRetryableDevicePollError,
    }),
    Effect.catchTag("RetryableDevicePollError", (e) =>
      Effect.fail(registryAccessFailure(registryUrl, "Device token exchange failed", e.cause)),
    ),
  );

// -----------------------------------------------------------------------------
// Single poll step
// -----------------------------------------------------------------------------

const postTokenForm = (
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  body: typeof GeneratedRegistryClient.AuthExchangeTokenRequestFormUrlEncoded.Encoded,
): Effect.Effect<NormalizedTokenResponse, RegistryClientFailure | OAuthTokenResponseError> => {
  const client = makeGeneratedAuthClient(httpClient, registryUrl);
  return client.AuthExchangeToken({ payload: body }).pipe(
    Effect.catch((error) => {
      const oauthCode = isRegistryClientError("AuthExchangeToken400")(error)
        ? getOAuthErrorCode(error.cause)
        : undefined;
      return Effect.fail(
        new OAuthTokenResponseError({
          ...(oauthCode === undefined ? {} : { oauthCode }),
          cause: error,
          retryable: isTransientRegistryError(error),
        }),
      );
    }),
    Effect.flatMap((response) =>
      Schema.is(SessionTokenResponseSchema)(response)
        ? Effect.succeed(response)
        : Effect.fail(
            registryAccessFailure(
              registryUrl,
              "Token exchange failed: the Registry response does not match the expected contract",
              response,
            ),
          ),
    ),
    Effect.map(normalizeTokenResponse),
  );
};

/**
 * Internal: execute a single device token poll against the OAuth token endpoint.
 *
 * Surfaces transient HTTP failures as RetryableDevicePollError so callers can
 * decide whether to retry; other failures surface as typed registry failures.
 *
 * @param httpClient - Effect HTTP client
 * @param registryUrl - Registry API origin
 * @param deviceCode - Device verification code from the initial authorization
 */
const pollOnceInternal = (
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  deviceCode: string,
): Effect.Effect<PollResult, AuthError | RetryableDevicePollError> =>
  postTokenForm(httpClient, registryUrl, {
    client_id: CLIENT_ID,
    device_code: deviceCode,
    grant_type: DEVICE_CODE_GRANT_TYPE,
  }).pipe(
    Effect.map((token): PollResult => ({
      _tag: "Success",
      token,
    })),
    Effect.catch((error): Effect.Effect<PollResult, AuthError | RetryableDevicePollError> => {
      if (isRegistryClientFailure(error)) return Effect.fail(error);
      const code = error.oauthCode;
      switch (code) {
        case "authorization_pending":
          return Effect.succeed<PollResult>({ _tag: "Pending" });
        case "slow_down":
          return Effect.succeed<PollResult>({ _tag: "SlowDown" });
        case "access_denied":
          return Effect.succeed<PollResult>({ _tag: "AccessDenied" });
        case "expired_token":
          return Effect.succeed<PollResult>({ _tag: "ExpiredToken" });
        default:
          break;
      }

      if (error.retryable) {
        return Effect.fail(new RetryableDevicePollError({ cause: error.cause }));
      }

      return Effect.fail(registryAccessFailure(registryUrl, "Token exchange failed", error.cause));
    }),
  );

/**
 * Execute a single device token poll (exported for testing).
 *
 * Transient HTTP failures are collapsed into AUTH_LOGIN_FAILED; this seam does
 * not retry on its own. For the retrying variant, use `pollDeviceToken`.
 */
export const pollOnce = (
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  deviceCode: string,
): Effect.Effect<PollResult, AuthError> =>
  pollOnceInternal(httpClient, registryUrl, deviceCode).pipe(
    Effect.catchTag("RetryableDevicePollError", (e) =>
      Effect.fail(registryAccessFailure(registryUrl, "Device token exchange failed", e.cause)),
    ),
  );

// -----------------------------------------------------------------------------
// Live layer
// -----------------------------------------------------------------------------

export const AuthClientLive = Layer.effect(
  AuthClient,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const registryUrl = yield* RegistryUrl;
    const authorizationOrigin = deriveAuthorizationOrigin(registryUrl);
    const client = makeGeneratedAuthClient(httpClient, registryUrl);

    const buildAuthorizeUrl: AuthClientService["buildAuthorizeUrl"] = ({
      challenge,
      expiresAt,
      state,
      redirectUri,
    }) => {
      const url = new URL("/oauth/authorize", authorizationOrigin);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", CLIENT_ID);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("state", state);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", LOGIN_SCOPE);
      if (expiresAt !== undefined) {
        url.searchParams.set("request_expires_at", DateTime.formatIso(expiresAt));
      }
      return url.href;
    };

    const getAuthorizationIssuer: AuthClientService["getAuthorizationIssuer"] = () =>
      authorizationOrigin;

    const exchangePkceCode: AuthClientService["exchangePkceCode"] = Effect.fn(
      "AuthClient.exchangePkceCode",
    )(function* ({ code, verifier, redirectUri }) {
      const response = yield* postTokenForm(httpClient, registryUrl, {
        grant_type: AUTHORIZATION_CODE_GRANT_TYPE,
        code,
        code_verifier: verifier,
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
      }).pipe(
        Effect.catchTag("OAuthTokenResponseError", (error) =>
          Effect.fail(
            new AuthExchangeFailed({
              detail: "Authorization code exchange failed",
              suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
              failure: registryAccessFailure(registryUrl, "Token exchange failed", error.cause),
            }),
          ),
        ),
      );

      return response;
    });

    const initiateDeviceFlow: AuthClientService["initiateDeviceFlow"] = Effect.fn(
      "AuthClient.initiateDeviceFlow",
    )(function* () {
      const response = yield* client
        .AuthIssueDeviceCode({
          payload: { client_id: CLIENT_ID, scope: LOGIN_SCOPE },
        })
        .pipe(
          Effect.mapError((error) =>
            mapRegistryAccessError(registryUrl, "Could not initiate device sign-in", error),
          ),
        );

      return {
        device_code: response.device_code,
        user_code: response.user_code,
        verification_uri: response.verification_uri,
        verification_uri_complete: response.verification_uri_complete,
        interval: response.interval,
        expires_in: response.expires_in,
      } satisfies DeviceFlowResponse;
    });

    const pollDeviceToken: AuthClientService["pollDeviceToken"] = Effect.fn(
      "AuthClient.pollDeviceToken",
    )(function* (deviceCode, interval) {
      let currentInterval = interval * 1000;

      while (true) {
        yield* Effect.sleep(currentInterval);
        const result = yield* retryTransientDevicePollFailure(
          registryUrl,
          pollOnceInternal(httpClient, registryUrl, deviceCode),
        );

        switch (result._tag) {
          case "Success":
            return result.token;
          case "Pending":
            continue;
          case "SlowDown":
            currentInterval += SLOW_DOWN_INCREMENT_MS;
            continue;
          case "AccessDenied":
            return yield* new DeviceLoginDenied();
          case "ExpiredToken":
            return yield* new DeviceLoginCodeExpired();
        }
      }
    });

    const getMe: AuthClientService["getMe"] = Effect.fn("AuthClient.getMe")(
      function* (accessToken) {
        // The transport carries whichever credential the invocation resolved.
        // A caller only names a token when the store does not hold it yet —
        // the identity read that follows a just-issued sign-in.
        const authedClient = makeGeneratedAuthClient(httpClient, registryUrl, accessToken);

        const decoded = yield* authedClient
          .AuthGetMe(undefined)
          .pipe(
            Effect.mapError((error) =>
              mapRegistryAccessError(registryUrl, "Could not read authenticated user", error),
            ),
          );

        return {
          userHandle: normalizeHandle(decoded.user.handle),
          tokenType: decoded.token.type,
          authority: decoded.token.authority,
          permissions: readTokenPermissions(decoded.token.permissions),
          resourceRestrictions: decoded.token.resource_restrictions ?? null,
          expiresAt: decoded.token.expires_at,
          approvedAt: decoded.token.approved_at,
        } satisfies MeResponse;
      },
    );

    const createToken: AuthClientService["createToken"] = Effect.fn("AuthClient.createToken")(
      function* (params) {
        const authedClient = makeGeneratedAuthClient(httpClient, registryUrl);
        const decoded = yield* authedClient
          .TokensCreate({
            payload: {
              name: params.name,
              permissions: params.permissions,
              expires_in: params.expiresIn,
            },
          })
          .pipe(
            Effect.mapError((error) =>
              mapRegistryAccessError(registryUrl, "Could not create token", error),
            ),
          );

        return {
          id: decoded.id,
          token: decoded.token,
          name: decoded.name,
          permissions: decoded.permissions,
          createdAt: decoded.created_at,
          expiresAt: decoded.expires_at,
        } satisfies CreatedTokenResponse;
      },
    );

    const listTokens: AuthClientService["listTokens"] = Effect.fn("AuthClient.listTokens")(
      function* (params) {
        const authedClient = makeGeneratedAuthClient(httpClient, registryUrl);
        const decoded = yield* authedClient
          .TokensList({
            params: {
              ...(params?.limit === undefined ? {} : { limit: String(params.limit) }),
              ...(params?.cursor === undefined ? {} : { cursor: params.cursor }),
            },
          })
          .pipe(
            Effect.mapError((error) =>
              mapRegistryAccessError(registryUrl, "Could not list tokens", error),
            ),
          );

        return {
          tokens: decoded.tokens.map((token) => ({
            id: token.id,
            name: token.name,
            type: token.type,
            permissions: token.permissions,
            createdAt: token.created_at,
            expiresAt: token.expires_at,
            lastUsedAt: token.last_used_at,
          })),
          hasMore: decoded.has_more,
          cursor: decoded.cursor,
        } satisfies TokenListResponse;
      },
    );

    const deleteToken: AuthClientService["deleteToken"] = Effect.fn("AuthClient.deleteToken")(
      function* (tokenId) {
        const authedClient = makeGeneratedAuthClient(httpClient, registryUrl);
        yield* authedClient
          .TokensDelete(tokenId, undefined)
          .pipe(
            Effect.mapError((error) =>
              mapRegistryAccessError(registryUrl, "Could not revoke token", error),
            ),
          );
      },
    );

    return {
      buildAuthorizeUrl,
      getAuthorizationIssuer,
      exchangePkceCode,
      initiateDeviceFlow,
      pollDeviceToken,
      getMe,
      createToken,
      listTokens,
      deleteToken,
    } satisfies AuthClientService;
  }),
);

// -----------------------------------------------------------------------------
// Token exchange live layer
// -----------------------------------------------------------------------------

/**
 * How long one call to a token endpoint may take before the Registry counts as
 * unreachable. Both calls run inside the credential home's refresh lock, so
 * this is also the longest one invocation makes the others wait.
 */
const TOKEN_ENDPOINT_DEADLINE = Duration.seconds(30);

/**
 * What the token endpoint's answer to a refresh grant means for the session.
 *
 * - `refused`: the Registry itself refused the grant — the refusal its
 *   contract declares, or an authentication refusal carrying the Registry's own
 *   error document. The refresh token is spent, revoked, or replaced.
 * - `unusable`: the Registry accepted the grant, or answered in a shape this
 *   client cannot read. The refresh token may be spent and nothing usable came
 *   back, so presenting it again would trip reuse detection.
 * - `undecided`: nothing that speaks for the grant answered — no connection, a
 *   server error, a rate limit, or a refusal with no Registry error document,
 *   which is an intermediary's. The session is whatever it was before the
 *   attempt.
 */
const refreshAnswer = (error: unknown): "refused" | "unusable" | "undecided" => {
  if (isRegistryClientError("AuthExchangeToken400")(error)) return "refused";
  if (isSchemaError(error)) return "unusable";
  if (!isHttpClientError(error) || error.response === undefined) return "undecided";
  const status = error.response.status;
  if (status >= 200 && status < 300) return "unusable";
  return (status === 401 || status === 403) &&
    getOAuthErrorCode(retainedRegistryResponseBody(error.response, undefined)) !== undefined
    ? "refused"
    : "undecided";
};

/**
 * The refresh grant, on the unauthenticated transport.
 *
 * The refresher acts on the line between a session the Registry ended and one
 * it said nothing about. Only the refusal the token endpoint's contract
 * declares ends a session. A Registry that could not be reached, failed while
 * trying, limited the rate, or was answered for by an intermediary has decided
 * nothing: the credential is kept and the caller may retry. An accepted grant
 * whose answer cannot be read is neither — the session cannot be kept, and the
 * failure says why instead of blaming the network.
 */
export const TokenExchangeLive = Layer.effect(
  TokenExchange,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;

    const refreshToken: TokenExchangeService["refreshToken"] = Effect.fn(
      "TokenExchange.refreshToken",
    )(function* (refreshTokenValue, registryUrl) {
      const unusable = (cause: unknown) =>
        new RegistryAccessFailed({
          category: "internal",
          detail:
            "The Registry answered the session renewal outside its contract, so the renewed session could not be kept.",
          suggestions: [{ description: "Sign in again.", cmd: "axm login" }],
          cause,
        });
      return yield* postTokenForm(httpClient, registryUrl, {
        grant_type: "refresh_token",
        refresh_token: refreshTokenValue,
        client_id: CLIENT_ID,
      }).pipe(
        Effect.mapError((error): SessionEnded | RefreshUnavailable | RegistryAccessFailed => {
          if (isRegistryClientFailure(error)) return unusable(error);
          switch (refreshAnswer(error.cause)) {
            case "refused":
              return new SessionEnded({ registryUrl, cause: error.cause });
            case "unusable":
              return unusable(error.cause);
            case "undecided":
              return new RefreshUnavailable({
                registryUrl,
                detail: "The Registry could not be reached to renew your session.",
                cause: error.cause,
              });
          }
        }),
        Effect.timeoutOrElse({
          duration: TOKEN_ENDPOINT_DEADLINE,
          orElse: () =>
            Effect.fail(
              new RefreshUnavailable({
                registryUrl,
                detail: "The Registry did not answer in time to renew your session.",
              }),
            ),
        }),
      );
    });

    const revokeToken: TokenExchangeService["revokeToken"] = Effect.fn("TokenExchange.revokeToken")(
      function* (refreshTokenValue, registryUrl) {
        yield* makeGeneratedAuthClient(httpClient, registryUrl)
          .AuthRevokeOAuthToken({
            payload: { token: refreshTokenValue, token_type_hint: "refresh_token" },
          })
          .pipe(
            Effect.mapError((error) =>
              mapRegistryAccessError(registryUrl, "Token revocation failed", error),
            ),
            Effect.timeoutOrElse({
              duration: TOKEN_ENDPOINT_DEADLINE,
              orElse: () =>
                Effect.fail(
                  new RegistryRequestFailed({
                    category: "timeout",
                    detail: "Token revocation failed: the Registry did not answer in time.",
                  }),
                ),
            }),
          );
      },
    );

    return { refreshToken, revokeToken } satisfies TokenExchangeService;
  }),
);

export const TokenExchangeTest = (overrides?: Partial<TokenExchangeService>) =>
  Layer.succeed(TokenExchange, {
    refreshToken: (_token, registryUrl) =>
      Effect.fail(
        new RefreshUnavailable({
          registryUrl,
          detail: "Not implemented in test",
        }),
      ),
    revokeToken: () => Effect.void,
    ...overrides,
  } satisfies TokenExchangeService);

// -----------------------------------------------------------------------------
// Test layer factory
// -----------------------------------------------------------------------------

export const AuthClientTest = (overrides?: Partial<AuthClientService>) =>
  Layer.succeed(AuthClient, {
    buildAuthorizeUrl: ({ redirectUri }) =>
      `https://agentxm.ai/oauth/authorize?redirect_uri=${redirectUri}`,
    getAuthorizationIssuer: () => "https://agentxm.ai",
    exchangePkceCode: () =>
      Effect.fail(
        new RegistryAccessFailed({
          category: "auth",
          detail: "Not implemented in test",
        }),
      ),
    initiateDeviceFlow: () =>
      Effect.fail(
        new RegistryAccessFailed({
          category: "auth",
          detail: "Not implemented in test",
        }),
      ),
    pollDeviceToken: () =>
      Effect.fail(
        new RegistryAccessFailed({
          category: "auth",
          detail: "Not implemented in test",
        }),
      ),
    getMe: () =>
      Effect.fail(
        new RegistryAccessFailed({
          category: "auth",
          detail: "Not implemented in test",
        }),
      ),
    createToken: () =>
      Effect.fail(
        new RegistryAccessFailed({
          category: "auth",
          detail: "Not implemented in test",
        }),
      ),
    listTokens: () =>
      Effect.fail(
        new RegistryAccessFailed({
          category: "auth",
          detail: "Not implemented in test",
        }),
      ),
    deleteToken: () => Effect.void,
    ...overrides,
  } satisfies AuthClientService);
