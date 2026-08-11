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
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { type AppError, makeAppError } from "../app-error/index.js";
import { DateTimeUtcSchema } from "../date-time.js";
import type { ExtensionName, ExtensionType } from "../extensions/index.js";
import { normalizeHandle, type Handle } from "../extensions/handle.js";
import { PublishVisibilitySchema, type PublishVisibility } from "../publish/visibility.js";
import type { Version } from "../version-constraints/version-constraints.js";
import { type NormalizedTokenResponse } from "./oauth-contract.js";
import { RegistryUrl } from "./registry-url.js";
import * as GeneratedRegistryClient from "../registry/__generated__/registry-client.js";
import {
  isRegistryClientError,
  isAnyRegistryClientError,
  isSchemaError,
  hasTagSuffix,
  getString,
  isTransientHttpClientError,
} from "../registry/error-mapping.js";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CLIENT_ID = "axm-cli";
const OIDC_LOGIN_SCOPES = ["openid", "profile", "email", "offline_access"] as const;
const REGISTRY_LOGIN_SCOPES = [
  "extensions:read",
  "extensions:publish:new",
  "extensions:publish:version",
  "extensions:yank",
  "extensions:admin",
  "account:read",
  "account:write",
] as const;
const DEFAULT_LOGIN_SCOPES = [...OIDC_LOGIN_SCOPES, ...REGISTRY_LOGIN_SCOPES];
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
  readonly verification_uri_complete?: string;
  readonly interval: number;
  readonly expires_in: number;
}

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
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
  readonly archiveSha256: string;
  readonly visibilityContract: "v1";
  readonly requestedVisibility?: PublishVisibility["value"];
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
  readonly visibilityContract: "v1";
  readonly visibility: PublishVisibility;
  readonly condition: string;
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
  ) => Effect.Effect<NormalizedTokenResponse, AppError>;
  readonly createPublishAuthorizationRequest: (
    params: CreatePublishAuthorizationRequestParams,
  ) => Effect.Effect<PublishAuthorizationRequestResponse, AppError>;
  readonly exchangePublishAuthorizationCode: (
    params: ExchangePublishAuthorizationCodeParams,
  ) => Effect.Effect<PublishCapabilityResponse, AppError>;
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
  "@agentxm/client-core/unstable/auth/auth-client/AuthClient",
) {}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

class RetryableDevicePollError extends Data.TaggedError("RetryableDevicePollError")<{
  readonly cause: unknown;
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

const PublishAuthorizationRequestResponseSchema = Schema.Struct({
  request_id: Schema.String,
  authorization_url: Schema.String,
  expires_at: DateTimeUtcSchema,
});

const PublishCapabilityResponseSchema = Schema.Struct({
  access_token: Schema.String,
  expires_at: DateTimeUtcSchema,
  scope: Schema.String,
  publish_request_id: Schema.String,
  visibility_contract: Schema.Literal("v1"),
  visibility: PublishVisibilitySchema,
  condition: Schema.String.check(Schema.isMinLength(1)),
});

const OAuthTokenErrorResponseSchema = Schema.Struct({
  error: Schema.String,
  error_description: Schema.optional(Schema.String),
});

const WhoamiResponseSchema = Schema.Struct({
  handle: Schema.String,
});

const CreatedTokenResponseSchema = Schema.Struct({
  id: Schema.String,
  token: Schema.String,
  name: Schema.String,
  scopes: Schema.Array(Schema.String),
  permissions: Schema.Unknown,
  created_at: DateTimeUtcSchema,
  expires_at: DateTimeUtcSchema,
});

const TokenListResponseSchema = Schema.Struct({
  tokens: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.NullOr(Schema.String),
      type: Schema.String,
      scopes: Schema.Array(Schema.String),
      permissions: Schema.NullOr(Schema.Unknown),
      created_at: DateTimeUtcSchema,
      expires_at: DateTimeUtcSchema,
      last_used_at: Schema.NullOr(DateTimeUtcSchema),
    }),
  ),
  has_more: Schema.Boolean,
  cursor: Schema.NullOr(Schema.String),
});

const StepUpRequiredResponseSchema = Schema.Struct({
  code: Schema.Literal("eotp"),
  max_age: Schema.optionalKey(Schema.Int),
  step_up: Schema.Struct({
    request_id: Schema.String,
    verification_url: Schema.String,
    status_url: Schema.String,
    expires_at: DateTimeUtcSchema,
    interval: Schema.Int,
    action: Schema.String,
    target: Schema.String,
  }),
});

const StepUpRequestStatusResponseSchema = Schema.Struct({
  status: Schema.Literals(["pending", "verified", "consumed", "cancelled", "expired"]),
  expires_at: DateTimeUtcSchema,
});

type StepUpPollResult =
  | {
      readonly kind: "status";
      readonly response: typeof StepUpRequestStatusResponseSchema.Type;
    }
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number };

const unexpectedTokenStatus = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.flatMap(
    Effect.orElseSucceed(response.text, () => "Unexpected status code"),
    (description) =>
      Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.StatusCodeError({
            request: response.request,
            response,
            description,
          }),
        }),
      ),
  );

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

const mapAuthCodeExchangeError = (error: unknown) =>
  makeAppError({
    code: "auth",
    detail: "Authorization code exchange failed",
    suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
    cause: error,
  });

const getOAuthErrorCode = (error: unknown): string | undefined =>
  getString(error, "error") ?? getString(error, "code");

const isRetryableDevicePollError = (
  error: AppError | RetryableDevicePollError,
): error is RetryableDevicePollError => error._tag === "RetryableDevicePollError";

const makeTransientDevicePollAppError = (cause: unknown) =>
  makeAppError({
    code: "auth",
    detail: "Lost connection to the registry during login",
    suggestions: [
      {
        description: "Verify the registry is reachable, then try signing in again.",
        cmd: "axm login",
      },
    ],
    cause,
  });

const isAppError = (error: unknown): error is AppError => getString(error, "_tag") === "AppError";

const registryHttpErrorMetadata = (error: HttpClientError.HttpClientError) => ({
  request: {
    service: "registry",
    method: error.request.method,
    url: error.request.url,
  },
  ...(error.response === undefined
    ? {}
    : {
        response: {
          status: error.response.status,
        },
      }),
});

const mapRegistryAuthError = (operation: string, error: unknown): AppError =>
  isAppError(error)
    ? error
    : makeAppError({
        code: "auth",
        detail: operation,
        ...(HttpClientError.isHttpClientError(error)
          ? { metadata: registryHttpErrorMetadata(error) }
          : {}),
        suggestions: [{ description: "Sign in again.", cmd: "axm login" }],
        cause: error,
      });

const executeAuthedRequest = (
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  accessToken: string,
  request: HttpClientRequest.HttpClientRequest,
) =>
  httpClient
    .pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl)),
      HttpClient.mapRequest(HttpClientRequest.bearerToken(accessToken)),
    )
    .execute(request);

const stepUpRequiredAppError = (response: typeof StepUpRequiredResponseSchema.Type) =>
  makeAppError({
    code: "auth_required",
    detail: "Step-up authentication is required",
    blockedOn: "human",
    action: {
      kind: "open-url",
      url: response.step_up.verification_url,
      expiresAt: DateTime.formatIso(response.step_up.expires_at),
    },
    metadata: {
      response: {
        status: 401,
        body: { ...response },
      },
    },
    recover: "Complete verification while the command is waiting, or rerun the command to restart.",
    cause: response,
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

const postTokenForm = (
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  body: Readonly<Record<string, string>>,
): Effect.Effect<NormalizedTokenResponse, unknown> =>
  HttpClientRequest.post("/v1/auth/token").pipe(
    HttpClientRequest.bodyUrlParams(body),
    (request) =>
      httpClient
        .pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl)))
        .execute(request),
    Effect.flatMap(
      HttpClientResponse.matchStatus({
        "2xx": HttpClientResponse.schemaBodyJson(SessionTokenResponseSchema),
        "400": (response) =>
          HttpClientResponse.schemaBodyJson(OAuthTokenErrorResponseSchema)(response).pipe(
            Effect.flatMap((error) => Effect.fail(error)),
          ),
        orElse: unexpectedTokenStatus,
      }),
    ),
    Effect.map(normalizeTokenResponse),
  );

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
          break;
      }

      if (isTransientHttpClientError(error)) {
        return Effect.fail(new RetryableDevicePollError({ cause: error }));
      }

      return Effect.fail(
        makeAppError({
          code: "auth",
          detail: "Device token exchange failed with an unexpected error",
          suggestions: [{ description: "Try signing in again.", cmd: "axm login" }],
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
  httpClient: HttpClient.HttpClient,
  registryUrl: string,
  deviceCode: string,
): Effect.Effect<PollResult, AppError> =>
  pollOnceInternal(httpClient, registryUrl, deviceCode).pipe(
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
    const authorizationOrigin = deriveAuthorizationOrigin(registryUrl);
    const client = GeneratedRegistryClient.make(
      httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl))),
    );

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
      url.searchParams.set("scope", (scopes ?? DEFAULT_LOGIN_SCOPES).join(" "));
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
      }).pipe(Effect.mapError(mapAuthCodeExchangeError));

      return response;
    });

    const createPublishAuthorizationRequest: AuthClientService["createPublishAuthorizationRequest"] =
      Effect.fn("AuthClient.createPublishAuthorizationRequest")(function* (params) {
        const response = yield* HttpClientRequest.post("/v1/auth/publish-requests").pipe(
          HttpClientRequest.bodyJsonUnsafe({
            client_id: CLIENT_ID,
            redirect_uri: params.redirectUri,
            state: params.state,
            code_challenge: params.codeChallenge,
            code_challenge_method: "S256",
            owner: params.owner,
            type: params.type,
            name: params.name,
            version: params.version,
            archive_sha256: params.archiveSha256,
            visibility_contract: params.visibilityContract,
            ...(params.requestedVisibility === undefined
              ? {}
              : { visibility: params.requestedVisibility }),
          }),
          (request) =>
            httpClient
              .pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(params.registryUrl)))
              .execute(request),
          Effect.flatMap(
            HttpClientResponse.matchStatus({
              "2xx": HttpClientResponse.schemaBodyJson(PublishAuthorizationRequestResponseSchema),
              orElse: unexpectedTokenStatus,
            }),
          ),
          Effect.mapError((error) =>
            mapRegistryAuthError("Could not create publish authorization request", error),
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
        const response = yield* HttpClientRequest.post("/v1/auth/token").pipe(
          HttpClientRequest.bodyUrlParams({
            grant_type: AUTHORIZATION_CODE_GRANT_TYPE,
            code: params.code,
            code_verifier: params.verifier,
            client_id: CLIENT_ID,
            redirect_uri: params.redirectUri,
          }),
          (request) =>
            httpClient
              .pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(params.registryUrl)))
              .execute(request),
          Effect.flatMap(
            HttpClientResponse.matchStatus({
              "2xx": HttpClientResponse.schemaBodyJson(PublishCapabilityResponseSchema),
              "400": (publishResponse) =>
                HttpClientResponse.schemaBodyJson(OAuthTokenErrorResponseSchema)(
                  publishResponse,
                ).pipe(Effect.flatMap((error) => Effect.fail(error))),
              orElse: unexpectedTokenStatus,
            }),
          ),
          Effect.mapError((error) => {
            const code = getOAuthErrorCode(error);
            if (isSchemaError(error)) {
              return makeAppError({
                code: "internal",
                detail: "The registry is incompatible with exact publish authorization.",
                suggestions: [
                  {
                    description:
                      "Use a registry that supports visibility-bound exact publish capabilities.",
                  },
                ],
                cause: error,
              });
            }
            return makeAppError({
              code: "auth",
              detail:
                code === "invalid_grant"
                  ? "Publish authorization expired or was already used"
                  : "Publish authorization code exchange failed",
              suggestions: [
                { description: "Review the exact publish request again by rerunning publish." },
              ],
              cause: error,
            });
          }),
        );

        return {
          accessToken: response.access_token,
          expiresAt: response.expires_at,
          scope: response.scope,
          publishRequestId: response.publish_request_id,
          visibilityContract: response.visibility_contract,
          visibility: response.visibility,
          condition: response.condition,
        } satisfies PublishCapabilityResponse;
      });

    const initiateDeviceFlow: AuthClientService["initiateDeviceFlow"] = Effect.fn(
      "AuthClient.initiateDeviceFlow",
    )(function* (options) {
      const response = yield* client
        .AuthIssueDeviceCode({
          payload: {
            client_id: CLIENT_ID,
            scope: (options?.scopes ?? DEFAULT_LOGIN_SCOPES).join(" "),
          },
        })
        .pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "auth",
              detail: "Could not connect to the registry",
              suggestions: [
                {
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
        const result = yield* retryTransientDevicePollFailure(
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
          Effect.mapError((error) =>
            makeAppError({
              code: "auth",
              detail: "Token refresh request failed",
              suggestions: [{ description: "Sign in again.", cmd: "axm login" }],
              cause: error,
            }),
          ),
        );
      },
    );

    const revokeToken: AuthClientService["revokeToken"] = Effect.fn("AuthClient.revokeToken")(
      function* (token) {
        yield* HttpClientRequest.post("/v1/auth/revoke").pipe(
          HttpClientRequest.bodyUrlParams({
            token,
            token_type_hint: "refresh_token",
          }),
          (request) =>
            httpClient
              .pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl)))
              .execute(request),
          Effect.flatMap(
            HttpClientResponse.matchStatus({
              "200": () => Effect.void,
              orElse: (response) => response.text.pipe(Effect.flatMap(Effect.fail)),
            }),
          ),
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
                detail: "Not authenticated or token is invalid",
                suggestions: [{ description: "Sign in again.", cmd: "axm login" }],
                cause: error,
              });
            }
            if (isRegistryClientError("AuthGetMe400")(error)) {
              return makeAppError({
                code: "auth",
                detail: "Not authenticated or token is invalid",
                suggestions: [{ description: "Sign in again.", cmd: "axm login" }],
                cause: error,
              });
            }
            // Defense-in-depth: currently unreachable because AuthGetMe doesn't produce
            // 5xx RegistryClientError tags (500+ responses arrive as HttpClientError), but
            // kept to safely handle future generated-client changes that add 5xx variants.
            if (isAnyRegistryClientError(error) && hasTagSuffix(error, "5xx")) {
              return makeAppError({
                code: "network",
                detail: "Registry returned server error",
                suggestions: [
                  {
                    description: "The registry may be temporarily unavailable. Try again later.",
                  },
                ],
                cause: error,
              });
            }
            return makeAppError({
              code: "auth",
              detail: "Could not connect to the registry",
              suggestions: [
                {
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

    const getWhoami: AuthClientService["getWhoami"] = Effect.fn("AuthClient.getWhoami")(
      function* (accessToken) {
        const decoded = yield* executeAuthedRequest(
          httpClient,
          registryUrl,
          accessToken,
          HttpClientRequest.get("/v1/auth/whoami"),
        ).pipe(
          Effect.flatMap(
            HttpClientResponse.matchStatus({
              "2xx": HttpClientResponse.schemaBodyJson(WhoamiResponseSchema),
              orElse: unexpectedTokenStatus,
            }),
          ),
          Effect.mapError((error) =>
            mapRegistryAuthError("Could not read authenticated identity", error),
          ),
        );

        return {
          handle: normalizeHandle(decoded.handle),
        } satisfies WhoamiResponse;
      },
    );

    const createToken: AuthClientService["createToken"] = Effect.fn("AuthClient.createToken")(
      function* (accessToken, params, options) {
        const baseRequest = HttpClientRequest.post("/v1/tokens");
        const request =
          options?.stepUpRequestId === undefined
            ? baseRequest
            : HttpClientRequest.setHeaders({
                "x-axm-step-up-request": options.stepUpRequestId,
              })(baseRequest);
        const decoded = yield* request.pipe(
          HttpClientRequest.bodyJsonUnsafe({
            name: params.name,
            permissions: params.permissions,
            expires_in: params.expiresIn,
          }),
          (request) => executeAuthedRequest(httpClient, registryUrl, accessToken, request),
          Effect.flatMap(
            HttpClientResponse.matchStatus({
              "2xx": HttpClientResponse.schemaBodyJson(CreatedTokenResponseSchema),
              "401": (response) =>
                HttpClientResponse.schemaBodyJson(StepUpRequiredResponseSchema)(response).pipe(
                  Effect.flatMap((body) => Effect.fail(stepUpRequiredAppError(body))),
                ),
              orElse: unexpectedTokenStatus,
            }),
          ),
          Effect.mapError((error) => mapRegistryAuthError("Could not create token", error)),
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
        const search = new URLSearchParams();
        if (params?.limit !== undefined) {
          search.set("limit", String(params.limit));
        }
        if (params?.cursor !== undefined) {
          search.set("cursor", params.cursor);
        }
        const query = search.toString();
        const path = query.length > 0 ? `/v1/tokens?${query}` : "/v1/tokens";

        const decoded = yield* executeAuthedRequest(
          httpClient,
          registryUrl,
          accessToken,
          HttpClientRequest.get(path),
        ).pipe(
          Effect.flatMap(
            HttpClientResponse.matchStatus({
              "2xx": HttpClientResponse.schemaBodyJson(TokenListResponseSchema),
              orElse: unexpectedTokenStatus,
            }),
          ),
          Effect.mapError((error) => mapRegistryAuthError("Could not list tokens", error)),
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
      const statusPath = `${parsedStatusUrl.pathname}${parsedStatusUrl.search}`;

      for (let attempt = 0; attempt < 300; attempt += 1) {
        const result: StepUpPollResult = yield* executeAuthedRequest(
          httpClient,
          registryUrl,
          accessToken,
          HttpClientRequest.get(statusPath),
        ).pipe(
          Effect.flatMap(
            HttpClientResponse.matchStatus({
              "2xx": (response) =>
                HttpClientResponse.schemaBodyJson(StepUpRequestStatusResponseSchema)(response).pipe(
                  Effect.map(
                    (decoded) => ({ kind: "status", response: decoded }) satisfies StepUpPollResult,
                  ),
                ),
              "429": (response) =>
                Effect.succeed({
                  kind: "rate_limited",
                  retryAfterSeconds: retryAfterSeconds(
                    response.headers["retry-after"],
                    Math.max(1, intervalSeconds),
                  ),
                } satisfies StepUpPollResult),
              orElse: unexpectedTokenStatus,
            }),
          ),
          Effect.mapError((error) => mapRegistryAuthError("Could not complete step-up", error)),
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
        const baseRequest = HttpClientRequest.delete(`/v1/tokens/${encodeURIComponent(tokenId)}`);
        const request =
          options?.stepUpRequestId === undefined
            ? baseRequest
            : HttpClientRequest.setHeaders({
                "x-axm-step-up-request": options.stepUpRequestId,
              })(baseRequest);

        yield* executeAuthedRequest(httpClient, registryUrl, accessToken, request).pipe(
          Effect.flatMap(
            HttpClientResponse.matchStatus({
              "2xx": () => Effect.void,
              "401": (response) =>
                HttpClientResponse.schemaBodyJson(StepUpRequiredResponseSchema)(response).pipe(
                  Effect.flatMap((body) => Effect.fail(stepUpRequiredAppError(body))),
                ),
              orElse: unexpectedTokenStatus,
            }),
          ),
          Effect.mapError((error) => mapRegistryAuthError("Could not revoke token", error)),
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
