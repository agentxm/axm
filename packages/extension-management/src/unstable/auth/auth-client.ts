// @effect-diagnostics anyUnknownInErrorContext:off — HTTP schema/status errors remain opaque only inside this translating adapter
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
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { type AppError, makeAppError } from "../app-error/index.js";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import { normalizeHandle, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  PublishVisibilitySchema,
  type PublishVisibility,
} from "@agentxm/registry-protocol/unstable/publish/visibility";
import {
  PreviewPublicationSetResponseSchema,
  type PreviewPublicationSetRequest,
  type PreviewPublicationSetResponse,
  type Sha256Hex,
} from "@agentxm/registry-protocol/unstable/registry/publication-set";
import { type NormalizedTokenResponse } from "./oauth-contract.js";
import { RegistryUrl } from "./registry-url.js";
import * as GeneratedRegistryClient from "../registry/__generated__/registry-client.js";
import {
  isHttpClientError,
  isRegistryClientError,
  getString,
  isTransientHttpClientError,
} from "../registry/error-mapping.js";
import {
  captureRegistryErrorResponseBodies,
  mapRegistryFailure,
  withAppErrorSemantics,
} from "../registry/failure-mapping.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CLIENT_ID = "axm-cli";
export const OIDC_LOGIN_SCOPES = ["openid", "profile", "email", "offline_access"] as const;
export const BASELINE_REGISTRY_LOGIN_SCOPES = ["extensions:read", "account:read"] as const;
export const DEFAULT_LOGIN_SCOPES = [
  ...OIDC_LOGIN_SCOPES,
  ...BASELINE_REGISTRY_LOGIN_SCOPES,
] as const;
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

export const normalizeRequestedLoginScopes = (
  scopes: ReadonlyArray<string> = DEFAULT_LOGIN_SCOPES,
): ReadonlyArray<string> =>
  Array.from(
    new Set([...OIDC_LOGIN_SCOPES, ...scopes].map((scope) => scope.trim()).filter(Boolean)),
  ).sort();

export interface LoginScopeOptions {
  readonly scopes?: ReadonlyArray<string>;
}

export interface MeResponse {
  readonly userId: string;
  readonly userHandle: Handle;
  readonly email: string;
  readonly tokenType: string;
  readonly scopes: ReadonlyArray<string>;
  readonly orgs: ReadonlyArray<{ readonly id: string; readonly handle: Handle }>;
}

export interface WhoamiResponse {
  readonly handle: Handle;
}

export interface TokenPermissionsRequest {
  readonly owners?: ReadonlyArray<string>;
  readonly extensions?: ReadonlyArray<string>;
  readonly permission?: "read" | "publish" | "admin";
  readonly org_permission?: "read" | "write" | "admin";
  readonly cidr?: ReadonlyArray<string>;
  readonly bypass_mfa?: boolean;
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
  readonly scopes: ReadonlyArray<string>;
  readonly permissions: unknown;
  readonly createdAt: DateTime.Utc;
  readonly expiresAt: DateTime.Utc;
}

export interface TokenListItem {
  readonly id: string;
  readonly name: string | null;
  readonly type: string;
  readonly scopes: ReadonlyArray<string>;
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

export interface DeleteTokenOptions {
  readonly stepUpRequestId?: string;
}

export interface CreateTokenOptions {
  readonly stepUpRequestId?: string;
}

export interface BuildAuthorizeUrlParams {
  readonly challenge: string;
  readonly expiresAt?: DateTime.Utc;
  readonly state: string;
  readonly redirectUri: string;
  readonly scopes?: ReadonlyArray<string>;
}

export interface ExchangePkceCodeParams {
  readonly code: string;
  readonly verifier: string;
  readonly redirectUri: string;
}

export interface CreatePublishAuthorizationRequestParams {
  readonly registryUrl: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly publicationSet: PreviewPublicationSetRequest;
}

export interface PublishAuthorizationRequestResponse {
  readonly requestId: string;
  readonly authorizationUrl: string;
  readonly expiresAt: DateTime.Utc;
}

export interface ExchangePublishAuthorizationCodeParams {
  readonly registryUrl: string;
  readonly code: string;
  readonly verifier: string;
  readonly redirectUri: string;
}

export interface PublishCapabilityResponse {
  readonly accessToken: string;
  readonly expiresAt: DateTime.Utc;
  readonly scope: string;
  readonly publishRequestId: string;
  readonly visibilityContract: "v2";
  readonly visibility: PublishVisibility;
  readonly condition: string;
  readonly publicationSetDigest: Sha256Hex;
  readonly publicationDescriptorDigest: Sha256Hex;
}

export type PublishAuthorizationExchangeResponse =
  | {
      readonly status: "admitted";
      readonly preview: PreviewPublicationSetResponse;
      readonly grants: ReadonlyArray<PublishCapabilityResponse>;
    }
  | {
      readonly status: "blocked";
      readonly preview: PreviewPublicationSetResponse;
      readonly grants: readonly [];
    };

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
  ) => Effect.Effect<NormalizedTokenResponse, AppError>;
  readonly createPublishAuthorizationRequest: (
    params: CreatePublishAuthorizationRequestParams,
  ) => Effect.Effect<PublishAuthorizationRequestResponse, AppError>;
  readonly exchangePublishAuthorizationCode: (
    params: ExchangePublishAuthorizationCodeParams,
  ) => Effect.Effect<PublishAuthorizationExchangeResponse, AppError>;
  readonly initiateDeviceFlow: (
    options?: LoginScopeOptions,
  ) => Effect.Effect<DeviceFlowResponse, AppError>;
  readonly pollDeviceToken: (
    deviceCode: string,
    interval: number,
  ) => Effect.Effect<NormalizedTokenResponse, AppError>;
  readonly refreshToken: (
    refreshTokenValue: string,
  ) => Effect.Effect<NormalizedTokenResponse, AppError>;
  readonly revokeToken: (token: string) => Effect.Effect<void, AppError>;
  readonly getMe: (accessToken: string) => Effect.Effect<MeResponse, AppError>;
  readonly getWhoami: (accessToken: string) => Effect.Effect<WhoamiResponse, AppError>;
  readonly createToken: (
    accessToken: string,
    params: CreateTokenParams,
    options?: CreateTokenOptions,
  ) => Effect.Effect<CreatedTokenResponse, AppError>;
  readonly listTokens: (
    accessToken: string,
    params?: { readonly limit?: number; readonly cursor?: string },
  ) => Effect.Effect<TokenListResponse, AppError>;
  readonly waitForStepUpRequest: (
    accessToken: string,
    statusUrl: string,
    intervalSeconds: number,
  ) => Effect.Effect<void, AppError>;
  readonly deleteToken: (
    accessToken: string,
    tokenId: string,
    options?: DeleteTokenOptions,
  ) => Effect.Effect<void, AppError>;
}

export class AuthClient extends ServiceMap.Service<AuthClient, AuthClientService>()(
  "@agentxm/extension-management/unstable/auth/auth-client/AuthClient",
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

const retryAfterSeconds = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.ceil(parsed) : fallback;
};

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

const PublishCapabilityResponseSchema = Schema.Struct({
  access_token: Schema.String,
  expires_at: DateTimeUtcSchema,
  scope: Schema.String,
  publish_request_id: Schema.String,
  visibility_contract: Schema.Literal("v2"),
  visibility: PublishVisibilitySchema,
  condition: Schema.String.check(Schema.isMinLength(1)),
  publication_set_digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  publication_descriptor_digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});

const PublishAuthorizationExchangeResponseSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("admitted"),
    preview: PreviewPublicationSetResponseSchema,
    grants: Schema.Array(PublishCapabilityResponseSchema),
  }),
  Schema.Struct({
    status: Schema.Literal("blocked"),
    preview: PreviewPublicationSetResponseSchema,
    grants: Schema.Tuple([]),
  }),
]);

type StepUpPollResult =
  | {
      readonly kind: "status";
      readonly response: GeneratedRegistryClient.StepUpRequestStatusResponse;
    }
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number };

const deriveAuthorizationOrigin = (registryUrl: string): string => {
  const url = new URL(registryUrl);
  if (url.origin === "https://registry.agentxm.ai") {
    return "https://agentxm.ai";
  }
  if (url.origin === "https://registry-dev.agentxm-ai.workers.dev") {
    return "https://web-dev.agentxm-ai.workers.dev";
  }
  if (url.host === "localhost:4300") {
    return "http://localhost:4200";
  }
  if (url.host === "127.0.0.1:4300") {
    return "http://127.0.0.1:4200";
  }
  if (url.hostname === "127.0.0.1") {
    return `${url.protocol}//${url.hostname}:4200`;
  }
  return url.origin;
};

const getOAuthErrorCode = (error: unknown): string | undefined =>
  getString(error, "error") ?? getString(error, "code");

const isRetryableDevicePollError = (
  error: AppError | RetryableDevicePollError,
): error is RetryableDevicePollError => error._tag === "RetryableDevicePollError";

const registryAuthFailure = (registryUrl: string, operation: string, error: unknown): AppError =>
  mapRegistryFailure(error, {
    baseUrl: registryUrl,
    networkDetail: `${operation}: the Registry could not be reached.`,
    incompatibleDetail: `${operation}: the Registry response does not match the expected contract.`,
    requestConstructionDetail: `${operation}: the Registry request could not be constructed.`,
    fallbackDetail: operation,
  });

const isAppError = (error: unknown): error is AppError => getString(error, "_tag") === "AppError";

const mapRegistryAuthError = (registryUrl: string, operation: string, error: unknown): AppError =>
  isAppError(error) ? error : registryAuthFailure(registryUrl, operation, error);

const makeGeneratedAuthClient = (
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  accessToken?: string,
  stepUpRequestId?: string,
) => {
  const remoteHttpClient = httpClient.pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl)),
  );
  const authedHttpClient =
    accessToken === undefined
      ? remoteHttpClient
      : remoteHttpClient.pipe(HttpClient.mapRequest(HttpClientRequest.bearerToken(accessToken)));
  const registryHttpClient = captureRegistryErrorResponseBodies(
    stepUpRequestId === undefined
      ? authedHttpClient
      : authedHttpClient.pipe(
          HttpClient.mapRequest(
            HttpClientRequest.setHeaders({ "x-axm-step-up-request": stepUpRequestId }),
          ),
        ),
  );
  return GeneratedRegistryClient.make(registryHttpClient);
};

const stepUpRequiredAppError = (error: AppError, stepUp: StepUpRequest) =>
  makeAppError({
    code: "auth_required",
    detail: "Step-up authentication is required",
    blockedOn: "human",
    action: {
      kind: "open-url",
      url: stepUp.verificationUrl,
      expiresAt: stepUp.expiresAt,
    },
    ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
    recover: "Complete verification while the command is waiting, or rerun the command to restart.",
    cause: error.cause,
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === "string" ? value : null;
};

const readInteger = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
};

const readExpiry = (record: Record<string, unknown>): string | null => {
  const value = record["expires_at"];
  if (typeof value === "string") return value;
  return DateTime.isDateTime(value) ? DateTime.formatIso(value) : null;
};

export const readStepUpRequest = (error: AppError): StepUpRequest | null => {
  const body = error.metadata?.response?.body;
  if (!isRecord(body) || readString(body, "code") !== "eotp") return null;
  const wire = body["step_up"];
  if (!isRecord(wire)) return null;

  const requestId = readString(wire, "request_id");
  const verificationUrl = readString(wire, "verification_url");
  const statusUrl = readString(wire, "status_url");
  const expiresAt = readExpiry(wire);
  const intervalSeconds = readInteger(wire, "interval");
  const action = readString(wire, "action");
  const target = readString(wire, "target");
  if (
    requestId === null ||
    verificationUrl === null ||
    statusUrl === null ||
    expiresAt === null ||
    intervalSeconds === null ||
    action === null ||
    target === null
  ) {
    return null;
  }

  const maxAgeSeconds = readInteger(body, "max_age");
  return {
    requestId,
    verificationUrl,
    statusUrl,
    expiresAt,
    intervalSeconds,
    ...(maxAgeSeconds === null ? {} : { maxAgeSeconds }),
    action,
    target,
  };
};

/**
 * Retry transient device-poll failures with exponential backoff, capped at
 * TRANSIENT_DEVICE_POLL_RETRY_COUNT attempts. Non-retryable AppErrors bypass
 * the retry via the `while` predicate, and any RetryableDevicePollError that
 * survives retry exhaustion is translated to a user-facing AppError.
 */
const retryTransientDevicePollFailure = <A>(
  registryUrl: string,
  effect: Effect.Effect<A, AppError | RetryableDevicePollError>,
): Effect.Effect<A, AppError> =>
  effect.pipe(
    Effect.retry({
      times: TRANSIENT_DEVICE_POLL_RETRY_COUNT,
      schedule: Schedule.exponential(TRANSIENT_DEVICE_POLL_RETRY_BASE_DELAY),
      while: isRetryableDevicePollError,
    }),
    Effect.catchTag("RetryableDevicePollError", (e) =>
      Effect.fail(
        isAppError(e.cause)
          ? e.cause
          : registryAuthFailure(registryUrl, "Device token exchange failed", e.cause),
      ),
    ),
  );

// -----------------------------------------------------------------------------
// Single poll step
// -----------------------------------------------------------------------------

const postTokenForm = (
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  body: typeof GeneratedRegistryClient.AuthExchangeTokenRequestFormUrlEncoded.Encoded,
): Effect.Effect<NormalizedTokenResponse, AppError | OAuthTokenResponseError> => {
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
          retryable: isTransientHttpClientError(error),
        }),
      );
    }),
    Effect.flatMap((response) =>
      Schema.is(SessionTokenResponseSchema)(response)
        ? Effect.succeed(response)
        : Effect.fail(
            registryAuthFailure(
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
 * decide whether to retry; other failures are mapped to AppError directly.
 *
 * @param httpClient - Effect HTTP client
 * @param registryUrl - Registry API origin
 * @param deviceCode - Device verification code from the initial authorization
 */
const pollOnceInternal = (
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  deviceCode: string,
): Effect.Effect<PollResult, AppError | RetryableDevicePollError> =>
  postTokenForm(httpClient, registryUrl, {
    client_id: CLIENT_ID,
    device_code: deviceCode,
    grant_type: DEVICE_CODE_GRANT_TYPE,
  }).pipe(
    Effect.map((token): PollResult => ({
      _tag: "Success",
      token,
    })),
    Effect.catch((error): Effect.Effect<PollResult, AppError | RetryableDevicePollError> => {
      if (isAppError(error)) return Effect.fail(error);
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

      return Effect.fail(registryAuthFailure(registryUrl, "Token exchange failed", error.cause));
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
): Effect.Effect<PollResult, AppError> =>
  pollOnceInternal(httpClient, registryUrl, deviceCode).pipe(
    Effect.catchTag("RetryableDevicePollError", (e) =>
      Effect.fail(
        isAppError(e.cause)
          ? e.cause
          : registryAuthFailure(registryUrl, "Device token exchange failed", e.cause),
      ),
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
      scopes,
    }) => {
      const url = new URL("/oauth/authorize", authorizationOrigin);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", CLIENT_ID);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("state", state);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", normalizeRequestedLoginScopes(scopes).join(" "));
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
            withAppErrorSemantics(
              registryAuthFailure(registryUrl, "Token exchange failed", error.cause),
              {
                code: "auth",
                detail: "Authorization code exchange failed",
                suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
              },
            ),
          ),
        ),
      );

      return response;
    });

    const createPublishAuthorizationRequest: AuthClientService["createPublishAuthorizationRequest"] =
      Effect.fn("AuthClient.createPublishAuthorizationRequest")(function* (params) {
        const publishClient = makeGeneratedAuthClient(httpClient, params.registryUrl);
        const publicationSet = yield* Schema.encodeUnknownEffect(
          GeneratedRegistryClient.PreviewPublicationSetRequest,
        )(params.publicationSet).pipe(
          Effect.mapError((error) =>
            mapRegistryAuthError(
              params.registryUrl,
              "Could not encode publish authorization request",
              error,
            ),
          ),
        );
        const response = yield* publishClient
          .AuthCreatePublishAuthorizationRequest({
            payload: {
              client_id: CLIENT_ID,
              redirect_uri: params.redirectUri,
              state: params.state,
              code_challenge: params.codeChallenge,
              code_challenge_method: "S256",
              publication_set: publicationSet,
            },
          })
          .pipe(
            Effect.mapError((error) =>
              mapRegistryAuthError(
                params.registryUrl,
                "Could not create publish authorization request",
                error,
              ),
            ),
          );

        return {
          requestId: response.request_id,
          authorizationUrl: response.authorization_url,
          expiresAt: response.expires_at,
        } satisfies PublishAuthorizationRequestResponse;
      });

    const exchangePublishAuthorizationCode: AuthClientService["exchangePublishAuthorizationCode"] =
      Effect.fn("AuthClient.exchangePublishAuthorizationCode")(function* (params) {
        const publishClient = makeGeneratedAuthClient(httpClient, params.registryUrl);
        const response = yield* publishClient
          .AuthExchangeToken({
            payload: {
              grant_type: AUTHORIZATION_CODE_GRANT_TYPE,
              code: params.code,
              code_verifier: params.verifier,
              client_id: CLIENT_ID,
              redirect_uri: params.redirectUri,
            },
          })
          .pipe(
            Effect.mapError((error) => {
              const mapped = mapRegistryAuthError(
                params.registryUrl,
                "Publish authorization code exchange failed",
                error,
              );
              const code = isRegistryClientError("AuthExchangeToken400")(error)
                ? getOAuthErrorCode(error.cause)
                : undefined;
              return code === "invalid_grant"
                ? withAppErrorSemantics(mapped, {
                    code: "auth",
                    detail: "Publish authorization expired or was already used",
                    suggestions: [
                      {
                        description: "Review the exact publish request again by rerunning publish.",
                      },
                    ],
                  })
                : mapped;
            }),
          );

        if (!Schema.is(PublishAuthorizationExchangeResponseSchema)(response)) {
          return yield* mapRegistryAuthError(
            params.registryUrl,
            "The Registry is incompatible with exact publish authorization",
            response,
          );
        }

        if (response.status === "blocked") {
          return response;
        }
        return {
          status: "admitted",
          preview: response.preview,
          grants: response.grants.map((grant): PublishCapabilityResponse => ({
            accessToken: grant.access_token,
            expiresAt: grant.expires_at,
            scope: grant.scope,
            publishRequestId: grant.publish_request_id,
            visibilityContract: grant.visibility_contract,
            visibility: grant.visibility,
            condition: grant.condition,
            publicationSetDigest: grant.publication_set_digest,
            publicationDescriptorDigest: grant.publication_descriptor_digest,
          })),
        } satisfies PublishAuthorizationExchangeResponse;
      });

    const initiateDeviceFlow: AuthClientService["initiateDeviceFlow"] = Effect.fn(
      "AuthClient.initiateDeviceFlow",
    )(function* (options) {
      const response = yield* client
        .AuthIssueDeviceCode({
          payload: {
            client_id: CLIENT_ID,
            scope: normalizeRequestedLoginScopes(options?.scopes).join(" "),
          },
        })
        .pipe(
          Effect.mapError((error) =>
            mapRegistryAuthError(registryUrl, "Could not initiate device sign-in", error),
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
            return yield* makeAppError({
              code: "auth",
              detail: "Login was denied or cancelled",
              suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
            });
          case "ExpiredToken":
            return yield* makeAppError({
              code: "auth",
              detail: "Login code expired",
              suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
            });
        }
      }
    });

    const refreshToken: AuthClientService["refreshToken"] = Effect.fn("AuthClient.refreshToken")(
      function* (refreshTokenValue) {
        return yield* postTokenForm(httpClient, registryUrl, {
          grant_type: "refresh_token",
          refresh_token: refreshTokenValue,
          client_id: CLIENT_ID,
        }).pipe(
          Effect.catchTag("OAuthTokenResponseError", (error) =>
            Effect.fail(
              withAppErrorSemantics(
                registryAuthFailure(registryUrl, "Token exchange failed", error.cause),
                {
                  code: "auth",
                  detail: "Token refresh request failed",
                  suggestions: [{ description: "Sign in again.", cmd: "axm login" }],
                },
              ),
            ),
          ),
        );
      },
    );

    const revokeToken: AuthClientService["revokeToken"] = Effect.fn("AuthClient.revokeToken")(
      function* (token) {
        yield* client
          .AuthRevokeOAuthToken({
            payload: { token, token_type_hint: "refresh_token" },
          })
          .pipe(
            Effect.catch((error) =>
              Effect.logWarning(
                `${mapRegistryAuthError(registryUrl, "Token revocation failed", error).detail} Local credentials will still be cleared.`,
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
        const authedClient = makeGeneratedAuthClient(httpClient, registryUrl, accessToken);

        const decoded = yield* authedClient
          .AuthGetMe(undefined)
          .pipe(
            Effect.mapError((error) =>
              mapRegistryAuthError(registryUrl, "Could not read authenticated user", error),
            ),
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

    const getWhoami: AuthClientService["getWhoami"] = Effect.fn("AuthClient.getWhoami")(
      function* (accessToken) {
        const authedClient = makeGeneratedAuthClient(httpClient, registryUrl, accessToken);
        const decoded = yield* authedClient
          .AuthGetWhoami(undefined)
          .pipe(
            Effect.mapError((error) =>
              mapRegistryAuthError(registryUrl, "Could not read authenticated identity", error),
            ),
          );

        return {
          handle: normalizeHandle(decoded.handle),
        } satisfies WhoamiResponse;
      },
    );

    const createToken: AuthClientService["createToken"] = Effect.fn("AuthClient.createToken")(
      function* (accessToken, params, options) {
        const authedClient = makeGeneratedAuthClient(httpClient, registryUrl, accessToken);
        const decoded = yield* authedClient
          .TokensCreate({
            ...(options?.stepUpRequestId === undefined
              ? {}
              : { params: { "x-axm-step-up-request": options.stepUpRequestId } }),
            payload: {
              name: params.name,
              permissions: params.permissions,
              expires_in: params.expiresIn,
            },
          })
          .pipe(
            Effect.mapError((error) => {
              const mapped = mapRegistryAuthError(registryUrl, "Could not create token", error);
              const stepUp = readStepUpRequest(mapped);
              return stepUp === null ? mapped : stepUpRequiredAppError(mapped, stepUp);
            }),
          );

        return {
          id: decoded.id,
          token: decoded.token,
          name: decoded.name,
          scopes: decoded.scopes,
          permissions: decoded.permissions,
          createdAt: decoded.created_at,
          expiresAt: decoded.expires_at,
        } satisfies CreatedTokenResponse;
      },
    );

    const listTokens: AuthClientService["listTokens"] = Effect.fn("AuthClient.listTokens")(
      function* (accessToken, params) {
        const authedClient = makeGeneratedAuthClient(httpClient, registryUrl, accessToken);
        const decoded = yield* authedClient
          .TokensList({
            params: {
              ...(params?.limit === undefined ? {} : { limit: String(params.limit) }),
              ...(params?.cursor === undefined ? {} : { cursor: params.cursor }),
            },
          })
          .pipe(
            Effect.mapError((error) =>
              mapRegistryAuthError(registryUrl, "Could not list tokens", error),
            ),
          );

        return {
          tokens: decoded.tokens.map((token) => ({
            id: token.id,
            name: token.name,
            type: token.type,
            scopes: token.scopes,
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

    const waitForStepUpRequest: AuthClientService["waitForStepUpRequest"] = Effect.fn(
      "AuthClient.waitForStepUpRequest",
    )(function* (accessToken, statusUrl, intervalSeconds) {
      const parsedStatusUrl = new URL(statusUrl);
      const requestId = parsedStatusUrl.pathname.slice(
        parsedStatusUrl.pathname.lastIndexOf("/") + 1,
      );

      for (let attempt = 0; attempt < 300; attempt += 1) {
        const authedClient = makeGeneratedAuthClient(httpClient, registryUrl, accessToken);
        const result: StepUpPollResult = yield* authedClient
          .AuthGetStepUpRequest(requestId, undefined)
          .pipe(
            Effect.map((response) => ({ kind: "status", response }) satisfies StepUpPollResult),
            Effect.catch((error) =>
              isRegistryClientError("AuthGetStepUpRequest429")(error) ||
              (isHttpClientError(error) && error.response?.status === 429)
                ? Effect.succeed({
                    kind: "rate_limited",
                    retryAfterSeconds: retryAfterSeconds(
                      error.response?.headers["retry-after"],
                      Math.max(1, intervalSeconds),
                    ),
                  } satisfies StepUpPollResult)
                : Effect.fail(
                    mapRegistryAuthError(registryUrl, "Could not complete step-up", error),
                  ),
            ),
          );

        if (result.kind === "rate_limited") {
          yield* Effect.sleep(Duration.seconds(result.retryAfterSeconds));
          continue;
        }

        switch (result.response.status) {
          case "verified":
            return;
          case "cancelled":
            return yield* makeAppError({
              code: "auth_denied",
              detail: "The step-up request was cancelled.",
              recover: "Rerun the command to start a new verification request.",
            });
          case "expired":
            return yield* makeAppError({
              code: "auth_expired",
              detail: "The step-up request expired before verification completed.",
              recover: "Rerun the command to start a new verification request.",
            });
          case "consumed":
            return yield* makeAppError({
              code: "conflict",
              detail: "The step-up request has already been used.",
              recover: "Rerun the command to start a new verification request.",
            });
          case "pending":
            yield* Effect.sleep(Duration.seconds(Math.max(0, intervalSeconds)));
        }
      }

      return yield* makeAppError({
        code: "auth_expired",
        detail: "The step-up request expired before verification completed.",
        recover: "Rerun the command to start a new verification request.",
        cause: { statusUrl },
      });
    });

    const deleteToken: AuthClientService["deleteToken"] = Effect.fn("AuthClient.deleteToken")(
      function* (accessToken, tokenId, options) {
        const authedClient = makeGeneratedAuthClient(
          httpClient,
          registryUrl,
          accessToken,
          options?.stepUpRequestId,
        );
        yield* authedClient.TokensDelete(tokenId, undefined).pipe(
          Effect.mapError((error) =>
            mapRegistryAuthError(registryUrl, "Could not revoke token", error),
          ),
          Effect.mapError((error) => {
            const stepUp = readStepUpRequest(error);
            return stepUp === null ? error : stepUpRequiredAppError(error, stepUp);
          }),
        );
      },
    );

    return {
      buildAuthorizeUrl,
      getAuthorizationIssuer,
      exchangePkceCode,
      createPublishAuthorizationRequest,
      exchangePublishAuthorizationCode,
      initiateDeviceFlow,
      pollDeviceToken,
      refreshToken,
      revokeToken,
      getMe,
      getWhoami,
      createToken,
      listTokens,
      waitForStepUpRequest,
      deleteToken,
    } satisfies AuthClientService;
  }),
);

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
        makeAppError({
          code: "auth",
          detail: "Not implemented in test",
        }),
      ),
    createPublishAuthorizationRequest: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          detail: "Not implemented in test",
        }),
      ),
    exchangePublishAuthorizationCode: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          detail: "Not implemented in test",
        }),
      ),
    initiateDeviceFlow: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          detail: "Not implemented in test",
        }),
      ),
    pollDeviceToken: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          detail: "Not implemented in test",
        }),
      ),
    refreshToken: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          detail: "Not implemented in test",
        }),
      ),
    revokeToken: () => Effect.void,
    getMe: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          detail: "Not implemented in test",
        }),
      ),
    getWhoami: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          detail: "Not implemented in test",
        }),
      ),
    createToken: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          detail: "Not implemented in test",
        }),
      ),
    listTokens: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          detail: "Not implemented in test",
        }),
      ),
    waitForStepUpRequest: () =>
      Effect.fail(
        makeAppError({
          code: "auth",
          detail: "Not implemented in test",
        }),
      ),
    deleteToken: () => Effect.void,
    ...overrides,
  } satisfies AuthClientService);
