/**
 * AuthClient Effect service — device flow login, token refresh, revocation, identity queries.
 *
 * Provides methods for the OAuth 2.0 Device Authorization Grant (RFC 8628)
 * and related auth operations against the AgentXM registry API.
 *
 * Uses the generated registry client for HTTP transport and maps all errors
 * to AppError with per-operation error codes.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as Data from "effect/Data";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import { type AppError, makeAppError } from "../app-error/index.js";
import { normalizeHandle, type Handle } from "../extensions/handle.js";
import { type NormalizedTokenResponse } from "./oauth-contract.js";
import { RegistryUrl } from "./registry-url.js";
import * as GeneratedRegistryClient from "../registry/__generated__/registry-client.js";
import {
  isRegistryClientError,
  isAnyRegistryClientError,
  hasTagSuffix,
  getString,
  isTransientHttpClientError,
} from "../registry/error-mapping.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CLIENT_ID = "axm-cli";
const DEVICE_CODE_SCOPES =
  "extensions:read extensions:publish:new extensions:publish:version extensions:yank extensions:admin account:read account:write";
const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
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
  readonly verification_uri_complete?: string;
  readonly interval: number;
  readonly expires_in: number;
}

export interface MeResponse {
  readonly userId: string;
  readonly userHandle: Handle;
  readonly email: string;
  readonly tokenType: string;
  readonly scopes: ReadonlyArray<string>;
  readonly orgs: ReadonlyArray<{ readonly id: string; readonly handle: Handle }>;
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
  readonly initiateDeviceFlow: () => Effect.Effect<DeviceFlowResponse, AppError>;
  readonly pollDeviceToken: (
    deviceCode: string,
    interval: number,
  ) => Effect.Effect<NormalizedTokenResponse, AppError>;
  readonly refreshToken: (
    refreshTokenValue: string,
  ) => Effect.Effect<NormalizedTokenResponse, AppError>;
  readonly revokeToken: (accessToken: string) => Effect.Effect<void, AppError>;
  readonly getMe: (accessToken: string) => Effect.Effect<MeResponse, AppError>;
}

export class AuthClient extends ServiceMap.Service<AuthClient, AuthClientService>()(
  "@agentxm/client-core/unstable/auth/auth-client/AuthClient",
) {}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

class RetryableDevicePollError extends Data.TaggedError("RetryableDevicePollError")<{
  readonly cause: unknown;
}> {}

/** Normalize a generated token response to our domain NormalizedTokenResponse. */
const normalizeTokenResponse = (token: {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: string;
}): NormalizedTokenResponse => ({
  access_token: token.access_token,
  refresh_token: token.refresh_token,
  expires_at: token.expires_at,
});

/**
 * Extract the semantic OAuth error from an AuthExchangeDeviceCode400 RegistryClientError.
 *
 * The generated 400 union can carry either a problem-style `{ code }` payload or
 * the RFC 8628 device-flow payload `{ error, error_description }`.
 */
const getOAuthErrorCode = (
  error: GeneratedRegistryClient.RegistryClientError<"AuthExchangeDeviceCode400", unknown>,
): string | undefined => getString(error.cause, "error") ?? getString(error.cause, "code");

const isRetryableDevicePollError = (
  error: AppError | RetryableDevicePollError,
): error is RetryableDevicePollError => error._tag === "RetryableDevicePollError";

const makeTransientDevicePollAppError = (cause: unknown) =>
  makeAppError({
    code: "auth",
    message: "Lost connection to the registry during login",
    breadcrumbs: [
      {
        task: "Recover",
        description: "Verify the registry is running and reachable, then try `axm login` again.",
      },
    ],
    cause,
  });

/**
 * Retry transient device-poll failures with exponential backoff, capped at
 * TRANSIENT_DEVICE_POLL_RETRY_COUNT attempts. Non-retryable AppErrors bypass
 * the retry via the `while` predicate, and any RetryableDevicePollError that
 * survives retry exhaustion is translated to a user-facing AppError.
 */
const retryTransientDevicePollFailure = <A>(
  effect: Effect.Effect<A, AppError | RetryableDevicePollError>,
): Effect.Effect<A, AppError> =>
  effect.pipe(
    Effect.retry({
      times: TRANSIENT_DEVICE_POLL_RETRY_COUNT,
      schedule: Schedule.exponential(TRANSIENT_DEVICE_POLL_RETRY_BASE_DELAY),
      while: isRetryableDevicePollError,
    }),
    Effect.catchTag("RetryableDevicePollError", (e) =>
      Effect.fail(makeTransientDevicePollAppError(e.cause)),
    ),
  );

// -----------------------------------------------------------------------------
// Single poll step
// -----------------------------------------------------------------------------

/**
 * Internal: execute a single device token poll against the generated client.
 *
 * Surfaces transient HTTP failures as RetryableDevicePollError so callers can
 * decide whether to retry; other failures are mapped to AppError directly.
 *
 * @param client - Generated registry client instance
 * @param deviceCode - Device verification code from the initial authorization
 */
const pollOnceInternal = (
  client: GeneratedRegistryClient.RegistryClient,
  deviceCode: string,
): Effect.Effect<PollResult, AppError | RetryableDevicePollError> =>
  client
    .AuthExchangeDeviceCode({
      payload: {
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: DEVICE_CODE_GRANT_TYPE,
      },
    })
    .pipe(
      Effect.map(
        (token): PollResult => ({
          _tag: "Success",
          token: normalizeTokenResponse(token),
        }),
      ),
      Effect.catch((error): Effect.Effect<PollResult, AppError | RetryableDevicePollError> => {
        if (isRegistryClientError("AuthExchangeDeviceCode400")(error)) {
          const code = getOAuthErrorCode(error);
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
              return Effect.fail(
                makeAppError({
                  code: "auth",
                  message: "Device token exchange failed with an unexpected error",
                  breadcrumbs: [{ task: "Recover", description: "Try running `axm login` again." }],
                  cause: error,
                }),
              );
          }
        }

        if (isTransientHttpClientError(error)) {
          return Effect.fail(new RetryableDevicePollError({ cause: error }));
        }

        return Effect.fail(
          makeAppError({
            code: "auth",
            message: "Device token exchange failed with an unexpected error",
            breadcrumbs: [{ task: "Recover", description: "Try running `axm login` again." }],
            cause: error,
          }),
        );
      }),
    );

/**
 * Execute a single device token poll (exported for testing).
 *
 * Transient HTTP failures are collapsed into AUTH_LOGIN_FAILED; this seam does
 * not retry on its own. For the retrying variant, use `pollDeviceToken`.
 */
export const pollOnce = (
  client: GeneratedRegistryClient.RegistryClient,
  deviceCode: string,
): Effect.Effect<PollResult, AppError> =>
  pollOnceInternal(client, deviceCode).pipe(
    Effect.catchTag("RetryableDevicePollError", (e) =>
      Effect.fail(makeTransientDevicePollAppError(e.cause)),
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
    const client = GeneratedRegistryClient.make(
      httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl))),
    );

    const initiateDeviceFlow: AuthClientService["initiateDeviceFlow"] = Effect.fn(
      "AuthClient.initiateDeviceFlow",
    )(function* () {
      const response = yield* client
        .AuthIssueDeviceCode({
          payload: { client_id: CLIENT_ID, scope: DEVICE_CODE_SCOPES },
        })
        .pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "auth",
              message: "Could not connect to the registry",
              breadcrumbs: [
                {
                  task: "Recover",
                  description: "Verify the registry is running and reachable, then try again.",
                },
              ],
              cause: error,
            }),
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
        const result = yield* retryTransientDevicePollFailure(pollOnceInternal(client, deviceCode));

        switch (result._tag) {
          case "Success":
            return result.token;
          case "Pending":
            continue;
          case "SlowDown":
            currentInterval += SLOW_DOWN_INCREMENT_MS;
            continue;
          case "AccessDenied":
            return yield* makeAppError({
              code: "auth",
              message: "Login was denied or cancelled",
              breadcrumbs: [{ task: "Recover", description: "Run `axm login` to try again." }],
            });
          case "ExpiredToken":
            return yield* makeAppError({
              code: "auth",
              message: "Login code expired",
              breadcrumbs: [{ task: "Recover", description: "Run `axm login` to try again." }],
            });
        }
      }
    });

    const refreshToken: AuthClientService["refreshToken"] = Effect.fn("AuthClient.refreshToken")(
      function* (refreshTokenValue) {
        const token = yield* client
          .AuthRefreshToken({
            payload: {
              grant_type: "refresh_token",
              refresh_token: refreshTokenValue,
              client_id: CLIENT_ID,
            },
          })
          .pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "auth",
                message: "Token refresh request failed",
                breadcrumbs: [
                  { task: "Recover", description: "Run `axm login` to re-authenticate." },
                ],
                cause: error,
              }),
            ),
          );

        return normalizeTokenResponse(token);
      },
    );

    const revokeToken: AuthClientService["revokeToken"] = Effect.fn("AuthClient.revokeToken")(
      function* (accessToken) {
        yield* client
          .AuthRevokeToken({
            payload: { token: accessToken },
          })
          .pipe(
            Effect.catch((error) =>
              Effect.logWarning(
                `Token revocation failed: ${String(error)}. Local credentials will still be cleared.`,
              ),
            ),
          );
      },
    );

    const getMe: AuthClientService["getMe"] = Effect.fn("AuthClient.getMe")(
      function* (accessToken) {
        // Inject bearer token via a per-request HttpClient wrapper for getMe.
        // The generated AuthGetMe operation uses GET /v1/auth/me with no payload,
        // so we need to add the Authorization header via the httpClient.
        const authedClient = GeneratedRegistryClient.make(
          httpClient.pipe(
            HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl)),
            HttpClient.mapRequest(HttpClientRequest.bearerToken(accessToken)),
          ),
        );

        const decoded = yield* authedClient.AuthGetMe(undefined).pipe(
          Effect.mapError((error): AppError => {
            if (isRegistryClientError("AuthGetMe401")(error)) {
              return makeAppError({
                code: "auth",
                message: "Not authenticated or token is invalid",
                breadcrumbs: [
                  { task: "Recover", description: "Run `axm login` to re-authenticate." },
                ],
                cause: error,
              });
            }
            if (isRegistryClientError("AuthGetMe400")(error)) {
              return makeAppError({
                code: "auth",
                message: "Not authenticated or token is invalid",
                breadcrumbs: [
                  { task: "Recover", description: "Run `axm login` to re-authenticate." },
                ],
                cause: error,
              });
            }
            // Defense-in-depth: currently unreachable because AuthGetMe doesn't produce
            // 5xx RegistryClientError tags (500+ responses arrive as HttpClientError), but
            // kept to safely handle future generated-client changes that add 5xx variants.
            if (isAnyRegistryClientError(error) && hasTagSuffix(error, "5xx")) {
              return makeAppError({
                code: "network",
                message: "Registry returned server error",
                breadcrumbs: [
                  {
                    task: "Recover",
                    description: "The registry may be temporarily unavailable. Try again later.",
                  },
                ],
                cause: error,
              });
            }
            return makeAppError({
              code: "auth",
              message: "Could not connect to the registry",
              breadcrumbs: [
                {
                  task: "Recover",
                  description: "Verify the registry is running and reachable, then try again.",
                },
              ],
              cause: error,
            });
          }),
        );

        return {
          userId: decoded.user.id,
          userHandle: normalizeHandle(decoded.user.handle),
          email: decoded.user.email ?? "",
          tokenType: decoded.token.type,
          scopes: decoded.token.scopes,
          orgs: [],
        } satisfies MeResponse;
      },
    );

    return {
      initiateDeviceFlow,
      pollDeviceToken,
      refreshToken,
      revokeToken,
      getMe,
    } satisfies AuthClientService;
  }),
);

// -----------------------------------------------------------------------------
// Test layer factory
// -----------------------------------------------------------------------------

export const AuthClientTest = (overrides?: Partial<AuthClientService>) =>
  Layer.succeed(AuthClient, {
    initiateDeviceFlow: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          message: "Not implemented in test",
        }),
      ),
    pollDeviceToken: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          message: "Not implemented in test",
        }),
      ),
    refreshToken: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          message: "Not implemented in test",
        }),
      ),
    revokeToken: () => Effect.void,
    getMe: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          message: "Not implemented in test",
        }),
      ),
    ...overrides,
  } satisfies AuthClientService);
