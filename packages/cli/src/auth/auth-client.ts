/**
 * AuthClient Effect service — device flow login, token refresh, revocation, identity queries.
 *
 * Provides methods for the OAuth 2.0 Device Authorization Grant (RFC 8628)
 * and related auth operations against the AgentXM registry API.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { type AppError, makeAppError } from "@axm.sh/core/unstable/app-error";
import {
  decodeTokenResponse,
  setOAuthFormBody,
  type NormalizedTokenResponse,
} from "./oauth-contract.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CLIENT_ID = "axm-cli";
const DEVICE_CODE_SCOPES =
  "extensions:read extensions:publish:new extensions:publish:version extensions:yank extensions:admin account:read account:write";
const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const SLOW_DOWN_INCREMENT_MS = 5000;

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

export type TokenResponse = NormalizedTokenResponse;

export interface MeResponse {
  readonly userId: string;
  readonly userHandle: string;
  readonly email: string;
  readonly tokenType: string;
  readonly scopes: ReadonlyArray<string>;
  readonly orgs: ReadonlyArray<{ readonly id: string; readonly handle: string }>;
}

// -----------------------------------------------------------------------------
// Response schemas
// -----------------------------------------------------------------------------

const DeviceFlowResponseSchema = Schema.Struct({
  device_code: Schema.String,
  user_code: Schema.String,
  verification_uri: Schema.String,
  verification_uri_complete: Schema.optional(Schema.String),
  interval: Schema.Number,
  expires_in: Schema.Number,
});

const RegistryMeResponseSchema = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    handle: Schema.String,
    email: Schema.NullOr(Schema.String),
  }),
  orgs: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      handle: Schema.String,
      role: Schema.String,
      type: Schema.String,
      verified: Schema.Boolean,
    }),
  ),
  token: Schema.Struct({
    type: Schema.String,
    scopes: Schema.Array(Schema.String),
  }),
});

// -----------------------------------------------------------------------------
// Device token polling error schema
// -----------------------------------------------------------------------------

const DeviceTokenErrorSchema = Schema.Struct({
  error: Schema.String,
});

// -----------------------------------------------------------------------------
// Polling state (for testability)
// -----------------------------------------------------------------------------

/** Result of a single poll iteration. */
export type PollResult =
  | { readonly _tag: "Pending" }
  | { readonly _tag: "SlowDown" }
  | { readonly _tag: "Success"; readonly token: TokenResponse }
  | { readonly _tag: "AccessDenied" }
  | { readonly _tag: "ExpiredToken" };

// -----------------------------------------------------------------------------
// Service interface
// -----------------------------------------------------------------------------

export interface AuthClientService {
  readonly initiateDeviceFlow: (registryUrl: string) => Effect.Effect<DeviceFlowResponse, AppError>;
  readonly pollDeviceToken: (
    registryUrl: string,
    deviceCode: string,
    interval: number,
  ) => Effect.Effect<TokenResponse, AppError>;
  readonly refreshToken: (
    registryUrl: string,
    refreshTokenValue: string,
  ) => Effect.Effect<TokenResponse, AppError>;
  readonly revokeToken: (registryUrl: string, accessToken: string) => Effect.Effect<void, AppError>;
  readonly getMe: (registryUrl: string, accessToken: string) => Effect.Effect<MeResponse, AppError>;
}

export class AuthClient extends ServiceMap.Service<AuthClient, AuthClientService>()(
  "@axm.sh/cli/AuthClient",
) {}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

const normalizeUrl = (registryUrl: string): string => registryUrl.replace(/\/+$/, "");

const readResponseBody = (
  response: { readonly text: Effect.Effect<string, unknown> },
  code: string,
  what: string,
) =>
  response.text.pipe(
    Effect.mapError((error) =>
      makeAppError({ code, what: `Failed to read response body: ${what}`, cause: error }),
    ),
  );

const parseJsonBody = (bodyText: string, code: string, what: string) =>
  Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(bodyText);
      return parsed;
    },
    catch: (error) => makeAppError({ code, what: `Failed to parse JSON: ${what}`, cause: error }),
  });

const decodeResponse = <S extends Schema.Top>(
  schema: S,
  parsed: unknown,
  code: string,
  what: string,
): Effect.Effect<S["Type"], AppError, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect(schema)(parsed).pipe(
    Effect.mapError((error) =>
      makeAppError({ code, what: `Invalid response schema: ${what}`, cause: error }),
    ),
  );

// -----------------------------------------------------------------------------
// Single poll step (exported for testing)
// -----------------------------------------------------------------------------

export const pollOnce = (
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  deviceCode: string,
): Effect.Effect<PollResult, AppError> =>
  Effect.gen(function* () {
    const url = `${normalizeUrl(registryUrl)}/v1/auth/device/token`;
    const request = setOAuthFormBody(HttpClientRequest.post(url), {
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: DEVICE_CODE_GRANT_TYPE,
    });

    const response = yield* httpClient.execute(request).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "AUTH_LOGIN_FAILED",
          what: "Device token poll request failed",
          howToFix: "Check network connectivity and try again.",
          cause: error,
        }),
      ),
    );

    if (response.status === 200) {
      const bodyText = yield* readResponseBody(response, "AUTH_LOGIN_FAILED", "device token");
      const json = yield* parseJsonBody(bodyText, "AUTH_LOGIN_FAILED", "device token");
      const token = yield* decodeTokenResponse(json, "AUTH_LOGIN_FAILED", "device token");
      return { _tag: "Success" as const, token };
    }

    // Error response — parse error code
    const bodyText = yield* readResponseBody(response, "AUTH_LOGIN_FAILED", "device token error");
    const json = yield* parseJsonBody(bodyText, "AUTH_LOGIN_FAILED", "device token error").pipe(
      Effect.catch(() => Effect.succeed(null)),
    );

    if (json !== null) {
      const errorResult = yield* Schema.decodeUnknownEffect(DeviceTokenErrorSchema)(json).pipe(
        Effect.catch(() => Effect.succeed(null)),
      );

      if (errorResult !== null) {
        switch (errorResult.error) {
          case "authorization_pending":
            return { _tag: "Pending" as const };
          case "slow_down":
            return { _tag: "SlowDown" as const };
          case "access_denied":
            return { _tag: "AccessDenied" as const };
          case "expired_token":
            return { _tag: "ExpiredToken" as const };
        }
      }
    }

    // Unknown error
    return yield* Effect.fail(
      makeAppError({
        code: "AUTH_LOGIN_FAILED",
        what: `Device token poll returned unexpected status ${String(response.status)}`,
        howToFix: "Try running `axm login` again.",
      }),
    );
  });

// -----------------------------------------------------------------------------
// Live layer
// -----------------------------------------------------------------------------

export const AuthClientLive = Layer.effect(
  AuthClient,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const initiateDeviceFlow: AuthClientService["initiateDeviceFlow"] = Effect.fn(
      "AuthClient.initiateDeviceFlow",
    )(function* (registryUrl) {
      const url = `${normalizeUrl(registryUrl)}/v1/auth/device/code`;
      const request = setOAuthFormBody(HttpClientRequest.post(url), {
        client_id: CLIENT_ID,
        scope: DEVICE_CODE_SCOPES,
      });

      const response = yield* httpClient.execute(request).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "AUTH_LOGIN_FAILED",
            what: "Device code request failed",
            howToFix: "Check network connectivity and try again.",
            cause: error,
          }),
        ),
      );

      if (response.status !== 200) {
        const bodyText = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")));
        return yield* Effect.fail(
          makeAppError({
            code: "AUTH_LOGIN_FAILED",
            what: `Device code request failed with status ${String(response.status)}`,
            details: bodyText.length > 0 ? [bodyText] : [],
            howToFix: "Check network connectivity and try again.",
          }),
        );
      }

      const bodyText = yield* readResponseBody(response, "AUTH_LOGIN_FAILED", "device code");
      const json = yield* parseJsonBody(bodyText, "AUTH_LOGIN_FAILED", "device code");
      const decoded = yield* decodeResponse(
        DeviceFlowResponseSchema,
        json,
        "AUTH_LOGIN_FAILED",
        "device code",
      );

      return {
        device_code: decoded.device_code,
        user_code: decoded.user_code,
        verification_uri: decoded.verification_uri,
        interval: decoded.interval,
        expires_in: decoded.expires_in,
        ...(decoded.verification_uri_complete
          ? { verification_uri_complete: decoded.verification_uri_complete }
          : {}),
      } satisfies DeviceFlowResponse;
    });
    const pollDeviceToken: AuthClientService["pollDeviceToken"] = Effect.fn(
      "AuthClient.pollDeviceToken",
    )(function* (registryUrl, deviceCode, interval) {
      let currentInterval = interval * 1000;

      while (true) {
        yield* Effect.sleep(currentInterval);
        const result = yield* pollOnce(httpClient, registryUrl, deviceCode);

        switch (result._tag) {
          case "Success":
            return result.token;
          case "Pending":
            continue;
          case "SlowDown":
            currentInterval += SLOW_DOWN_INCREMENT_MS;
            continue;
          case "AccessDenied":
            return yield* Effect.fail(
              makeAppError({
                code: "AUTH_LOGIN_CANCELLED",
                what: "Login was denied or cancelled",
                howToFix: "Run `axm login` to try again.",
              }),
            );
          case "ExpiredToken":
            return yield* Effect.fail(
              makeAppError({
                code: "AUTH_LOGIN_FAILED",
                what: "Login code expired",
                howToFix: "Run `axm login` to try again.",
              }),
            );
        }
      }
    });
    const refreshToken: AuthClientService["refreshToken"] = Effect.fn("AuthClient.refreshToken")(
      function* (registryUrl, refreshTokenValue) {
        const url = `${normalizeUrl(registryUrl)}/v1/auth/token/refresh`;
        const request = setOAuthFormBody(HttpClientRequest.post(url), {
          grant_type: "refresh_token",
          refresh_token: refreshTokenValue,
        });

        const response = yield* httpClient.execute(request).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "AUTH_REFRESH_FAILED",
              what: "Token refresh request failed",
              howToFix: "Run `axm login` to re-authenticate.",
              cause: error,
            }),
          ),
        );

        if (response.status !== 200) {
          const bodyText = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")));
          return yield* Effect.fail(
            makeAppError({
              code: "AUTH_REFRESH_FAILED",
              what: `Token refresh failed with status ${String(response.status)}`,
              details: bodyText.length > 0 ? [bodyText] : [],
              howToFix: "Run `axm login` to re-authenticate.",
            }),
          );
        }

        const bodyText = yield* readResponseBody(response, "AUTH_REFRESH_FAILED", "token refresh");
        const json = yield* parseJsonBody(bodyText, "AUTH_REFRESH_FAILED", "token refresh");
        return yield* decodeTokenResponse(json, "AUTH_REFRESH_FAILED", "token refresh");
      },
    );
    const revokeToken: AuthClientService["revokeToken"] = Effect.fn("AuthClient.revokeToken")(
      function* (registryUrl, accessToken) {
        const url = `${normalizeUrl(registryUrl)}/v1/auth/token/revoke`;
        const request = setOAuthFormBody(HttpClientRequest.post(url), {
          token: accessToken,
        });

        yield* httpClient.execute(request).pipe(
          Effect.flatMap((response) => {
            if (response.status !== 200 && response.status !== 204) {
              return Effect.logWarning(
                `Token revocation returned status ${String(response.status)}. Local credentials will still be cleared.`,
              );
            }
            return Effect.void;
          }),
          Effect.catch((error) =>
            Effect.logWarning(
              `Token revocation failed: ${String(error)}. Local credentials will still be cleared.`,
            ),
          ),
        );
      },
    );
    const getMe: AuthClientService["getMe"] = Effect.fn("AuthClient.getMe")(
      function* (registryUrl, accessToken) {
        const url = `${normalizeUrl(registryUrl)}/v1/auth/me`;
        const request = HttpClientRequest.get(url).pipe(HttpClientRequest.bearerToken(accessToken));

        const response = yield* httpClient.execute(request).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "AUTH_UNAUTHENTICATED",
              what: "Identity request failed",
              howToFix: "Run `axm login` to authenticate.",
              cause: error,
            }),
          ),
        );

        if (response.status === 401 || response.status === 403) {
          return yield* Effect.fail(
            makeAppError({
              code: "AUTH_UNAUTHENTICATED",
              what: "Not authenticated or token is invalid",
              howToFix: "Run `axm login` to re-authenticate.",
            }),
          );
        }

        if (response.status !== 200) {
          return yield* Effect.fail(
            makeAppError({
              code: "AUTH_UNAUTHENTICATED",
              what: `Identity request failed with status ${String(response.status)}`,
              howToFix: "Run `axm login` to re-authenticate.",
            }),
          );
        }

        const bodyText = yield* readResponseBody(response, "AUTH_UNAUTHENTICATED", "identity");
        const json = yield* parseJsonBody(bodyText, "AUTH_UNAUTHENTICATED", "identity");
        const decoded = yield* decodeResponse(
          RegistryMeResponseSchema,
          json,
          "AUTH_UNAUTHENTICATED",
          "identity",
        );

        return {
          userId: decoded.user.id,
          userHandle: decoded.user.handle,
          email: decoded.user.email ?? "",
          tokenType: decoded.token.type,
          scopes: decoded.token.scopes,
          orgs: decoded.orgs.map((org: (typeof decoded.orgs)[number]) => ({
            id: org.id,
            handle: org.handle,
          })),
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
      Effect.fail(makeAppError({ code: "AUTH_LOGIN_FAILED", what: "Not implemented in test" })),
    pollDeviceToken: () =>
      Effect.fail(makeAppError({ code: "AUTH_LOGIN_FAILED", what: "Not implemented in test" })),
    refreshToken: () =>
      Effect.fail(makeAppError({ code: "AUTH_REFRESH_FAILED", what: "Not implemented in test" })),
    revokeToken: () => Effect.void,
    getMe: () =>
      Effect.fail(makeAppError({ code: "AUTH_UNAUTHENTICATED", what: "Not implemented in test" })),
    ...overrides,
  } satisfies AuthClientService);
