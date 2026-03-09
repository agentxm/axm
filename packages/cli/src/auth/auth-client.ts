/**
 * AuthClient Effect service — device flow login, token refresh, revocation, identity queries.
 *
 * Provides methods for the OAuth 2.0 Device Authorization Grant (RFC 8628)
 * and related auth operations against the AgentXM registry API.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import type { CliError } from "../cli-error/cli-error.js";
import { makeCliError } from "../cli-error/cli-error.js";

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
  readonly interval: number;
  readonly expires_in: number;
}

export interface TokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: string;
}

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
  interval: Schema.Number,
  expires_in: Schema.Number,
});

const TokenResponseSchema = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_at: Schema.String,
});

const OrgSchema = Schema.Struct({
  id: Schema.String,
  handle: Schema.String,
});

const MeResponseSchema = Schema.Struct({
  userId: Schema.String,
  userHandle: Schema.String,
  email: Schema.String,
  tokenType: Schema.String,
  scopes: Schema.Array(Schema.String),
  orgs: Schema.Array(OrgSchema),
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
  readonly initiateDeviceFlow: (registryUrl: string) => Effect.Effect<DeviceFlowResponse, CliError>;
  readonly pollDeviceToken: (
    registryUrl: string,
    deviceCode: string,
    interval: number,
  ) => Effect.Effect<TokenResponse, CliError>;
  readonly refreshToken: (
    registryUrl: string,
    refreshTokenValue: string,
  ) => Effect.Effect<TokenResponse, CliError>;
  readonly revokeToken: (registryUrl: string, accessToken: string) => Effect.Effect<void, CliError>;
  readonly getMe: (registryUrl: string, accessToken: string) => Effect.Effect<MeResponse, CliError>;
}

export class AuthClient extends Context.Tag("@axm.sh/cli/AuthClient")<
  AuthClient,
  AuthClientService
>() {}

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
      makeCliError({ code, what: `Failed to read response body: ${what}`, cause: error }),
    ),
  );

const parseJsonBody = (bodyText: string, code: string, what: string) =>
  Effect.try({
    try: () => JSON.parse(bodyText) as unknown,
    catch: (error) => makeCliError({ code, what: `Failed to parse JSON: ${what}`, cause: error }),
  });

const decodeResponse = <A, I>(
  schema: Schema.Schema<A, I, never>,
  parsed: unknown,
  code: string,
  what: string,
) =>
  Schema.decodeUnknown(schema)(parsed).pipe(
    Effect.mapError((error) =>
      makeCliError({ code, what: `Invalid response schema: ${what}`, cause: error }),
    ),
  );

// -----------------------------------------------------------------------------
// Single poll step (exported for testing)
// -----------------------------------------------------------------------------

export const pollOnce = (
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  deviceCode: string,
): Effect.Effect<PollResult, CliError> =>
  Effect.gen(function* () {
    const url = `${normalizeUrl(registryUrl)}/v1/auth/device/token`;
    const request = yield* HttpClientRequest.post(url).pipe(
      HttpClientRequest.bodyJson({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: DEVICE_CODE_GRANT_TYPE,
      }),
      Effect.mapError((error) =>
        makeCliError({
          code: "AUTH_LOGIN_FAILED",
          what: "Failed to encode request body",
          cause: error,
        }),
      ),
    );

    const response = yield* httpClient.execute(request).pipe(
      Effect.mapError((error) =>
        makeCliError({
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
      const token = yield* decodeResponse(
        TokenResponseSchema,
        json,
        "AUTH_LOGIN_FAILED",
        "device token",
      );
      return { _tag: "Success" as const, token };
    }

    // Error response — parse error code
    const bodyText = yield* readResponseBody(response, "AUTH_LOGIN_FAILED", "device token error");
    const json = yield* parseJsonBody(bodyText, "AUTH_LOGIN_FAILED", "device token error").pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );

    if (json !== null) {
      const errorResult = yield* Schema.decodeUnknown(DeviceTokenErrorSchema)(json).pipe(
        Effect.catchAll(() => Effect.succeed(null)),
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
      makeCliError({
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

    return {
      initiateDeviceFlow: (registryUrl) =>
        Effect.gen(function* () {
          const url = `${normalizeUrl(registryUrl)}/v1/auth/device/code`;
          const request = yield* HttpClientRequest.post(url).pipe(
            HttpClientRequest.bodyJson({
              client_id: CLIENT_ID,
              scope: DEVICE_CODE_SCOPES,
            }),
            Effect.mapError((error) =>
              makeCliError({
                code: "AUTH_LOGIN_FAILED",
                what: "Failed to encode request body",
                cause: error,
              }),
            ),
          );

          const response = yield* httpClient.execute(request).pipe(
            Effect.mapError((error) =>
              makeCliError({
                code: "AUTH_LOGIN_FAILED",
                what: "Device code request failed",
                howToFix: "Check network connectivity and try again.",
                cause: error,
              }),
            ),
          );

          if (response.status !== 200) {
            const bodyText = yield* response.text.pipe(Effect.catchAll(() => Effect.succeed("")));
            return yield* Effect.fail(
              makeCliError({
                code: "AUTH_LOGIN_FAILED",
                what: `Device code request failed with status ${String(response.status)}`,
                details: bodyText.length > 0 ? [bodyText] : [],
                howToFix: "Check network connectivity and try again.",
              }),
            );
          }

          const bodyText = yield* readResponseBody(response, "AUTH_LOGIN_FAILED", "device code");
          const json = yield* parseJsonBody(bodyText, "AUTH_LOGIN_FAILED", "device code");
          return yield* decodeResponse(
            DeviceFlowResponseSchema,
            json,
            "AUTH_LOGIN_FAILED",
            "device code",
          );
        }),

      pollDeviceToken: (registryUrl, deviceCode, interval) =>
        Effect.gen(function* () {
          let currentInterval = interval * 1000; // convert to ms

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
                  makeCliError({
                    code: "AUTH_LOGIN_CANCELLED",
                    what: "Login was denied or cancelled",
                    howToFix: "Run `axm login` to try again.",
                  }),
                );
              case "ExpiredToken":
                return yield* Effect.fail(
                  makeCliError({
                    code: "AUTH_LOGIN_FAILED",
                    what: "Login code expired",
                    howToFix: "Run `axm login` to try again.",
                  }),
                );
            }
          }
        }),

      refreshToken: (registryUrl, refreshTokenValue) =>
        Effect.gen(function* () {
          const url = `${normalizeUrl(registryUrl)}/v1/auth/token/refresh`;
          const request = yield* HttpClientRequest.post(url).pipe(
            HttpClientRequest.bodyJson({ refresh_token: refreshTokenValue }),
            Effect.mapError((error) =>
              makeCliError({
                code: "AUTH_REFRESH_FAILED",
                what: "Failed to encode request body",
                cause: error,
              }),
            ),
          );

          const response = yield* httpClient.execute(request).pipe(
            Effect.mapError((error) =>
              makeCliError({
                code: "AUTH_REFRESH_FAILED",
                what: "Token refresh request failed",
                howToFix: "Run `axm login` to re-authenticate.",
                cause: error,
              }),
            ),
          );

          if (response.status !== 200) {
            const bodyText = yield* response.text.pipe(Effect.catchAll(() => Effect.succeed("")));
            return yield* Effect.fail(
              makeCliError({
                code: "AUTH_REFRESH_FAILED",
                what: `Token refresh failed with status ${String(response.status)}`,
                details: bodyText.length > 0 ? [bodyText] : [],
                howToFix: "Run `axm login` to re-authenticate.",
              }),
            );
          }

          const bodyText = yield* readResponseBody(
            response,
            "AUTH_REFRESH_FAILED",
            "token refresh",
          );
          const json = yield* parseJsonBody(bodyText, "AUTH_REFRESH_FAILED", "token refresh");
          return yield* decodeResponse(
            TokenResponseSchema,
            json,
            "AUTH_REFRESH_FAILED",
            "token refresh",
          );
        }),

      revokeToken: (registryUrl, accessToken) =>
        Effect.gen(function* () {
          const url = `${normalizeUrl(registryUrl)}/v1/auth/token/revoke`;
          const request = yield* HttpClientRequest.post(url).pipe(
            HttpClientRequest.bodyJson({ access_token: accessToken }),
            Effect.mapError((error) =>
              makeCliError({
                code: "AUTH_REVOKE_FAILED",
                what: "Failed to encode request body",
                cause: error,
              }),
            ),
          );

          yield* httpClient.execute(request).pipe(
            Effect.flatMap((response) => {
              if (response.status !== 200 && response.status !== 204) {
                return Effect.logWarning(
                  `Token revocation returned status ${String(response.status)}. Local credentials will still be cleared.`,
                );
              }
              return Effect.void;
            }),
            Effect.catchAll((error) =>
              Effect.logWarning(
                `Token revocation failed: ${String(error)}. Local credentials will still be cleared.`,
              ),
            ),
          );
        }),

      getMe: (registryUrl, accessToken) =>
        Effect.gen(function* () {
          const url = `${normalizeUrl(registryUrl)}/v1/auth/me`;
          const request = HttpClientRequest.get(url).pipe(
            HttpClientRequest.bearerToken(accessToken),
          );

          const response = yield* httpClient.execute(request).pipe(
            Effect.mapError((error) =>
              makeCliError({
                code: "AUTH_UNAUTHENTICATED",
                what: "Identity request failed",
                howToFix: "Run `axm login` to authenticate.",
                cause: error,
              }),
            ),
          );

          if (response.status === 401 || response.status === 403) {
            return yield* Effect.fail(
              makeCliError({
                code: "AUTH_UNAUTHENTICATED",
                what: "Not authenticated or token is invalid",
                howToFix: "Run `axm login` to re-authenticate.",
              }),
            );
          }

          if (response.status !== 200) {
            return yield* Effect.fail(
              makeCliError({
                code: "AUTH_UNAUTHENTICATED",
                what: `Identity request failed with status ${String(response.status)}`,
                howToFix: "Run `axm login` to re-authenticate.",
              }),
            );
          }

          const bodyText = yield* readResponseBody(response, "AUTH_UNAUTHENTICATED", "identity");
          const json = yield* parseJsonBody(bodyText, "AUTH_UNAUTHENTICATED", "identity");
          return yield* decodeResponse(MeResponseSchema, json, "AUTH_UNAUTHENTICATED", "identity");
        }),
    } satisfies AuthClientService;
  }),
);

// -----------------------------------------------------------------------------
// Test layer factory
// -----------------------------------------------------------------------------

export const AuthClientTest = (overrides?: Partial<AuthClientService>) =>
  Layer.succeed(AuthClient, {
    initiateDeviceFlow: () =>
      Effect.fail(makeCliError({ code: "AUTH_LOGIN_FAILED", what: "Not implemented in test" })),
    pollDeviceToken: () =>
      Effect.fail(makeCliError({ code: "AUTH_LOGIN_FAILED", what: "Not implemented in test" })),
    refreshToken: () =>
      Effect.fail(makeCliError({ code: "AUTH_REFRESH_FAILED", what: "Not implemented in test" })),
    revokeToken: () => Effect.void,
    getMe: () =>
      Effect.fail(makeCliError({ code: "AUTH_UNAUTHENTICATED", what: "Not implemented in test" })),
    ...overrides,
  } satisfies AuthClientService);
