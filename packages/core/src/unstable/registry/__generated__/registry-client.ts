// Generated from specs/registry-openapi.json — do not edit by hand.
// Regenerate: nx run core:generate-registry-client

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { SchemaError } from "effect/Schema";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
// non-recursive definitions
export type DeviceTokenOAuthError = {
  readonly _tag: "DeviceTokenOAuthError";
  readonly error: "authorization_pending" | "slow_down" | "expired_token" | "access_denied";
  readonly error_description: string;
};
export const DeviceTokenOAuthError = Schema.Struct({
  _tag: Schema.Literal("DeviceTokenOAuthError"),
  error: Schema.Literals(["authorization_pending", "slow_down", "expired_token", "access_denied"]),
  error_description: Schema.String,
});
export type UserId = string;
export const UserId = Schema.String.check(
  Schema.isPattern(new RegExp("^user_[0-7][0-9a-hjkmnp-tv-z]{25}$")),
);
export type TokId = string;
export const TokId = Schema.String.check(
  Schema.isPattern(new RegExp("^tok_[0-7][0-9a-hjkmnp-tv-z]{25}$")),
);
export type ExtId = string;
export const ExtId = Schema.String.check(
  Schema.isPattern(new RegExp("^ext_[0-7][0-9a-hjkmnp-tv-z]{25}$")),
);
// schemas
export type MetaGet200 = {
  readonly ok: true;
  readonly service: "registry";
  readonly message: string;
  readonly docs: string | null;
  readonly openapi: string | null;
};
export const MetaGet200 = Schema.Struct({
  ok: Schema.Literal(true),
  service: Schema.Literal("registry"),
  message: Schema.String,
  docs: Schema.Union([Schema.String, Schema.Null]),
  openapi: Schema.Union([Schema.String, Schema.Null]),
});
export type AuthIssueDeviceCode200 = {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri: string;
  readonly verification_uri_complete: string;
  readonly expires_in: number;
  readonly interval: number;
};
export const AuthIssueDeviceCode200 = Schema.Struct({
  device_code: Schema.String,
  user_code: Schema.String,
  verification_uri: Schema.String,
  verification_uri_complete: Schema.String,
  expires_in: Schema.Number.check(Schema.isInt()),
  interval: Schema.Number.check(Schema.isInt()),
});
export type AuthExchangeDeviceCode200 = {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: "Bearer";
  readonly expires_in: number | "NaN" | "Infinity" | "-Infinity" | "Infinity" | "-Infinity" | "NaN";
  readonly expires_at: string;
  readonly scope?: string | null;
};
export const AuthExchangeDeviceCode200 = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Union([
    Schema.Union([
      Schema.Number.check(Schema.isFinite()),
      Schema.Literal("NaN"),
      Schema.Literal("Infinity"),
      Schema.Literal("-Infinity"),
    ]),
    Schema.Literals(["Infinity", "-Infinity", "NaN"]),
  ]),
  expires_at: Schema.String,
  scope: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type AuthExchangeDeviceCode400 = DeviceTokenOAuthError;
export const AuthExchangeDeviceCode400 = DeviceTokenOAuthError;
export type AuthRefreshToken200 = {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: "Bearer";
  readonly expires_in: number | "NaN" | "Infinity" | "-Infinity" | "Infinity" | "-Infinity" | "NaN";
  readonly expires_at: string;
  readonly scope?: string | null;
};
export const AuthRefreshToken200 = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Union([
    Schema.Union([
      Schema.Number.check(Schema.isFinite()),
      Schema.Literal("NaN"),
      Schema.Literal("Infinity"),
      Schema.Literal("-Infinity"),
    ]),
    Schema.Literals(["Infinity", "-Infinity", "NaN"]),
  ]),
  expires_at: Schema.String,
  scope: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type AuthGetMe200 = {
  readonly user: { readonly id: UserId; readonly handle: string; readonly email: string | null };
  readonly orgs: ReadonlyArray<never>;
  readonly token: {
    readonly id: TokId;
    readonly type: "session" | "pat" | "oidc";
    readonly name: string | null;
    readonly scopes: ReadonlyArray<string>;
    readonly resource_restrictions: { readonly extensions: ReadonlyArray<string> | null };
    readonly expires_at: string;
  };
};
export const AuthGetMe200 = Schema.Struct({
  user: Schema.Struct({
    id: UserId,
    handle: Schema.String,
    email: Schema.Union([Schema.String, Schema.Null]),
  }),
  orgs: Schema.Array(Schema.Never),
  token: Schema.Struct({
    id: TokId,
    type: Schema.Literals(["session", "pat", "oidc"]),
    name: Schema.Union([Schema.String, Schema.Null]),
    scopes: Schema.Array(Schema.String),
    resource_restrictions: Schema.Struct({
      extensions: Schema.Union([Schema.Array(Schema.String), Schema.Null]),
    }),
    expires_at: Schema.String,
  }),
});
export type TokensListParams = { readonly cursor?: string | null; readonly limit?: string | null };
export const TokensListParams = Schema.Struct({
  cursor: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  limit: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type TokensList200 = {
  readonly tokens: ReadonlyArray<{
    readonly id: TokId;
    readonly name: string | null;
    readonly type: string;
    readonly scopes: ReadonlyArray<string>;
    readonly created_at: string;
    readonly expires_at: string;
    readonly last_used_at: string | null;
  }>;
  readonly has_more: boolean;
  readonly cursor: string | null;
};
export const TokensList200 = Schema.Struct({
  tokens: Schema.Array(
    Schema.Struct({
      id: TokId,
      name: Schema.Union([Schema.String, Schema.Null]),
      type: Schema.String,
      scopes: Schema.Array(Schema.String),
      created_at: Schema.String,
      expires_at: Schema.String,
      last_used_at: Schema.Union([Schema.String, Schema.Null]),
    }),
  ),
  has_more: Schema.Boolean,
  cursor: Schema.Union([Schema.String, Schema.Null]),
});
export type TokensCreateRequestJson = {
  readonly name: string;
  readonly scopes: ReadonlyArray<string>;
  readonly expires_in: number;
};
export const TokensCreateRequestJson = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1)),
  scopes: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
  expires_in: Schema.Number.check(Schema.isInt())
    .check(Schema.isFinite())
    .check(Schema.isGreaterThanOrEqualTo(3600))
    .check(Schema.isLessThanOrEqualTo(31536000)),
});
export type TokensCreate201 = {
  readonly id: TokId;
  readonly token: string;
  readonly name: string;
  readonly scopes: ReadonlyArray<string>;
  readonly created_at: string;
  readonly expires_at: string;
};
export const TokensCreate201 = Schema.Struct({
  id: TokId,
  token: Schema.String,
  name: Schema.String,
  scopes: Schema.Array(Schema.String),
  created_at: Schema.String,
  expires_at: Schema.String,
});
export type ExtensionsListByProfile200 = {
  readonly extensions: ReadonlyArray<{
    readonly name: string;
    readonly profile: string;
    readonly type: string;
    readonly latestVersion: string;
    readonly description?: string | null;
    readonly repository?: string | null;
    readonly license?: string | null;
    readonly authors?: ReadonlyArray<{
      readonly name?: string | null;
      readonly email?: string | null;
      readonly url?: string | null;
    }> | null;
    readonly visibility?: string | null;
    readonly deprecated_at?: string | null;
    readonly deprecation_notice?: string | null;
  }>;
};
export const ExtensionsListByProfile200 = Schema.Struct({
  extensions: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      profile: Schema.String,
      type: Schema.String,
      latestVersion: Schema.String,
      description: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      repository: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      license: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      authors: Schema.optionalKey(
        Schema.Union([
          Schema.Array(
            Schema.Struct({
              name: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
              email: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
              url: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
            }),
          ),
          Schema.Null,
        ]),
      ),
      visibility: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      deprecated_at: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      deprecation_notice: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
export type ExtensionsListByType200 = {
  readonly extensions: ReadonlyArray<{
    readonly name: string;
    readonly profile: string;
    readonly type: string;
    readonly latestVersion: string;
    readonly description?: string | null;
    readonly repository?: string | null;
    readonly license?: string | null;
    readonly authors?: ReadonlyArray<{
      readonly name?: string | null;
      readonly email?: string | null;
      readonly url?: string | null;
    }> | null;
    readonly visibility?: string | null;
    readonly deprecated_at?: string | null;
    readonly deprecation_notice?: string | null;
  }>;
};
export const ExtensionsListByType200 = Schema.Struct({
  extensions: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      profile: Schema.String,
      type: Schema.String,
      latestVersion: Schema.String,
      description: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      repository: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      license: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      authors: Schema.optionalKey(
        Schema.Union([
          Schema.Array(
            Schema.Struct({
              name: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
              email: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
              url: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
            }),
          ),
          Schema.Null,
        ]),
      ),
      visibility: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      deprecated_at: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      deprecation_notice: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
export type ExtensionsGet200 = {
  readonly name: string;
  readonly profile: string;
  readonly type: "skill" | "command" | "mcp-server" | "subagent" | "file" | "rule" | "pack";
  readonly description?: string | null;
  readonly repository?: string | null;
  readonly license?: string | null;
  readonly authors?: ReadonlyArray<{ readonly [x: string]: string }> | null;
  readonly versions: ReadonlyArray<{
    readonly version: string;
    readonly published: string;
    readonly integrity: string;
    readonly dependencies?: { readonly [x: string]: string } | null;
    readonly capabilities?: {
      readonly required?: ReadonlyArray<string> | null;
      readonly optional?: ReadonlyArray<string> | null;
    } | null;
    readonly yanked_at?: string | null;
  }>;
  readonly visibility?: "public" | "unlisted" | "private" | null;
  readonly deprecated_at?: string | null;
  readonly deprecation_notice?: string | null;
};
export const ExtensionsGet200 = Schema.Struct({
  name: Schema.String,
  profile: Schema.String,
  type: Schema.Literals(["skill", "command", "mcp-server", "subagent", "file", "rule", "pack"]),
  description: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  repository: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  license: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  authors: Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.Record(Schema.String, Schema.String)), Schema.Null]),
  ),
  versions: Schema.Array(
    Schema.Struct({
      version: Schema.String,
      published: Schema.String,
      integrity: Schema.String,
      dependencies: Schema.optionalKey(
        Schema.Union([Schema.Record(Schema.String, Schema.String), Schema.Null]),
      ),
      capabilities: Schema.optionalKey(
        Schema.Union([
          Schema.Struct({
            required: Schema.optionalKey(Schema.Union([Schema.Array(Schema.String), Schema.Null])),
            optional: Schema.optionalKey(Schema.Union([Schema.Array(Schema.String), Schema.Null])),
          }),
          Schema.Null,
        ]),
      ),
      yanked_at: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
  visibility: Schema.optionalKey(
    Schema.Union([Schema.Literals(["public", "unlisted", "private"]), Schema.Null]),
  ),
  deprecated_at: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  deprecation_notice: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type ExtensionsUpdateVisibilityRequestJson = {
  readonly visibility: "public" | "unlisted" | "private";
};
export const ExtensionsUpdateVisibilityRequestJson = Schema.Struct({
  visibility: Schema.Literals(["public", "unlisted", "private"]),
});
export type ExtensionsUpdateVisibility200 = {
  readonly id: ExtId;
  readonly profile: string;
  readonly type: string;
  readonly name: string;
  readonly visibility: string;
  readonly updatedAt: string;
};
export const ExtensionsUpdateVisibility200 = Schema.Struct({
  id: ExtId,
  profile: Schema.String,
  type: Schema.String,
  name: Schema.String,
  visibility: Schema.String,
  updatedAt: Schema.String,
});
export type ExtensionsGetVersion200 = {
  readonly name: string;
  readonly profile: string;
  readonly type: string;
  readonly version: string;
  readonly status: "pending" | "available" | "failed";
  readonly published: string;
  readonly integrity: string;
  readonly description?: string | null;
  readonly repository?: string | null;
  readonly license?: string | null;
  readonly authors?: ReadonlyArray<{ readonly [x: string]: string }> | null;
  readonly capabilities?: {
    readonly required?: ReadonlyArray<string> | null;
    readonly optional?: ReadonlyArray<string> | null;
  } | null;
  readonly dependencies?: { readonly [x: string]: string } | null;
  readonly yanked_at?: string | null;
  readonly deleted_at?: string | null;
};
export const ExtensionsGetVersion200 = Schema.Struct({
  name: Schema.String,
  profile: Schema.String,
  type: Schema.String,
  version: Schema.String,
  status: Schema.Literals(["pending", "available", "failed"]),
  published: Schema.String,
  integrity: Schema.String,
  description: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  repository: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  license: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  authors: Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.Record(Schema.String, Schema.String)), Schema.Null]),
  ),
  capabilities: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({
        required: Schema.optionalKey(Schema.Union([Schema.Array(Schema.String), Schema.Null])),
        optional: Schema.optionalKey(Schema.Union([Schema.Array(Schema.String), Schema.Null])),
      }),
      Schema.Null,
    ]),
  ),
  dependencies: Schema.optionalKey(
    Schema.Union([Schema.Record(Schema.String, Schema.String), Schema.Null]),
  ),
  yanked_at: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  deleted_at: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type ExtensionsPublishVersionRequestFormData = {
  readonly archive: string;
  readonly integrity?: string | null;
};
export const ExtensionsPublishVersionRequestFormData = Schema.Struct({
  archive: Schema.String.annotate({ description: "Extension archive multipart file part." }),
  integrity: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type ExtensionsPublishVersion200 = {
  readonly profile: string;
  readonly type: string;
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
  readonly sha256_hex: string;
  readonly published_at: string;
  readonly publish_status: string;
};
export const ExtensionsPublishVersion200 = Schema.Struct({
  profile: Schema.String,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
  integrity: Schema.String,
  sha256_hex: Schema.String,
  published_at: Schema.String,
  publish_status: Schema.String,
});
export type ExtensionsPublishVersion201 = {
  readonly profile: string;
  readonly type: string;
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
  readonly sha256_hex: string;
  readonly published_at: string;
  readonly publish_status: string;
};
export const ExtensionsPublishVersion201 = Schema.Struct({
  profile: Schema.String,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
  integrity: Schema.String,
  sha256_hex: Schema.String,
  published_at: Schema.String,
  publish_status: Schema.String,
});
export type ExtensionsGetHandleProfile200 = {
  readonly ok: true;
  readonly mock: true;
  readonly method: "GET";
  readonly route: "/v1/extensions/{handle}/profile";
  readonly message: string;
  readonly params: { readonly handle: string };
};
export const ExtensionsGetHandleProfile200 = Schema.Struct({
  ok: Schema.Literal(true),
  mock: Schema.Literal(true),
  method: Schema.Literal("GET"),
  route: Schema.Literal("/v1/extensions/{handle}/profile"),
  message: Schema.String,
  params: Schema.Struct({ handle: Schema.String }),
});
export type ExtensionsDeprecateRequestJson = { readonly notice?: string | null };
export const ExtensionsDeprecateRequestJson = Schema.Struct({
  notice: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type ExtensionsDeprecate200 = {
  readonly profile: string;
  readonly type: string;
  readonly name: string;
  readonly deprecatedAt: string | null;
  readonly deprecationNotice: string | null;
};
export const ExtensionsDeprecate200 = Schema.Struct({
  profile: Schema.String,
  type: Schema.String,
  name: Schema.String,
  deprecatedAt: Schema.Union([Schema.String, Schema.Null]),
  deprecationNotice: Schema.Union([Schema.String, Schema.Null]),
});
export type ExtensionsUndeprecate200 = {
  readonly profile: string;
  readonly type: string;
  readonly name: string;
  readonly deprecatedAt: null;
  readonly deprecationNotice: null;
};
export const ExtensionsUndeprecate200 = Schema.Struct({
  profile: Schema.String,
  type: Schema.String,
  name: Schema.String,
  deprecatedAt: Schema.Null,
  deprecationNotice: Schema.Null,
});
export type ExtensionsYankVersion200 = {
  readonly profile: string;
  readonly type: string;
  readonly name: string;
  readonly version: string;
  readonly yankedAt: string | null;
};
export const ExtensionsYankVersion200 = Schema.Struct({
  profile: Schema.String,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
  yankedAt: Schema.Union([Schema.String, Schema.Null]),
});
export type ExtensionsUnyankVersion200 = {
  readonly profile: string;
  readonly type: string;
  readonly name: string;
  readonly version: string;
  readonly yankedAt: null;
};
export const ExtensionsUnyankVersion200 = Schema.Struct({
  profile: Schema.String,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
  yankedAt: Schema.Null,
});
export type CollaboratorsListCollaborators200 = {
  readonly collaborators: ReadonlyArray<{
    readonly userId: UserId;
    readonly role: string;
    readonly grantedBy: UserId | null;
    readonly createdAt: string;
  }>;
};
export const CollaboratorsListCollaborators200 = Schema.Struct({
  collaborators: Schema.Array(
    Schema.Struct({
      userId: UserId,
      role: Schema.String,
      grantedBy: Schema.Union([UserId, Schema.Null]),
      createdAt: Schema.String,
    }),
  ),
});
export type CollaboratorsUpsertCollaboratorRequestJson = {
  readonly role: "admin" | "write" | "read";
};
export const CollaboratorsUpsertCollaboratorRequestJson = Schema.Struct({
  role: Schema.Literals(["admin", "write", "read"]),
});
export type CollaboratorsUpsertCollaborator200 = {
  readonly userId: UserId;
  readonly role: string;
  readonly grantedBy: UserId | null;
  readonly createdAt: string;
};
export const CollaboratorsUpsertCollaborator200 = Schema.Struct({
  userId: UserId,
  role: Schema.String,
  grantedBy: Schema.Union([UserId, Schema.Null]),
  createdAt: Schema.String,
});
export type HealthGetShallowHealth200 = { readonly status: "pass" | "warn" | "fail" };
export const HealthGetShallowHealth200 = Schema.Struct({
  status: Schema.Literals(["pass", "warn", "fail"]),
});
export type HealthGetDeepHealthParams = { readonly "x-health-key"?: string | null };
export const HealthGetDeepHealthParams = Schema.Struct({
  "x-health-key": Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type HealthGetDeepHealth200 = unknown;
export const HealthGetDeepHealth200 = Schema.Unknown;
export type HealthGetObservabilityVerificationParams = {
  readonly "x-health-key"?: string | null;
  readonly level?: string | null;
};
export const HealthGetObservabilityVerificationParams = Schema.Struct({
  "x-health-key": Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  level: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type HealthGetObservabilityVerification200 = unknown;
export const HealthGetObservabilityVerification200 = Schema.Unknown;
export type SearchSearchExtensionsParams = { readonly q: string };
export const SearchSearchExtensionsParams = Schema.Struct({
  q: Schema.String.check(Schema.isMinLength(1)),
});
export type SearchSearchExtensions200 = {
  readonly ok: true;
  readonly mock: true;
  readonly method: "GET";
  readonly route: "/v1/search";
  readonly message: string;
  readonly query: { readonly q: string };
};
export const SearchSearchExtensions200 = Schema.Struct({
  ok: Schema.Literal(true),
  mock: Schema.Literal(true),
  method: Schema.Literal("GET"),
  route: Schema.Literal("/v1/search"),
  message: Schema.String,
  query: Schema.Struct({ q: Schema.String }),
});

export interface OperationConfig {
  /**
   * Whether or not the response should be included in the value returned from
   * an operation.
   *
   * If set to `true`, a tuple of `[A, HttpClientResponse]` will be returned,
   * where `A` is the success type of the operation.
   *
   * If set to `false`, only the success type of the operation will be returned.
   */
  readonly includeResponse?: boolean | undefined;
}

/**
 * A utility type which optionally includes the response in the return result
 * of an operation based upon the value of the `includeResponse` configuration
 * option.
 */
export type WithOptionalResponse<A, Config extends OperationConfig> = Config extends {
  readonly includeResponse: true;
}
  ? [A, HttpClientResponse.HttpClientResponse]
  : A;

export const make = (
  httpClient: HttpClient.HttpClient,
  options: {
    readonly transformClient?:
      | ((client: HttpClient.HttpClient) => Effect.Effect<HttpClient.HttpClient>)
      | undefined;
  } = {},
): RegistryClient => {
  const unexpectedStatus = (response: HttpClientResponse.HttpClientResponse) =>
    Effect.flatMap(
      Effect.orElseSucceed(response.json, () => "Unexpected status code"),
      (description) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.StatusCodeError({
              request: response.request,
              response,
              description:
                typeof description === "string" ? description : JSON.stringify(description),
            }),
          }),
        ),
    );
  const withResponse =
    <Config extends OperationConfig>(config: Config | undefined) =>
    (
      f: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<any, any>,
    ): ((request: HttpClientRequest.HttpClientRequest) => Effect.Effect<any, any>) => {
      const withOptionalResponse = (
        config?.includeResponse
          ? (response: HttpClientResponse.HttpClientResponse) =>
              Effect.map(f(response), (a) => [a, response])
          : (response: HttpClientResponse.HttpClientResponse) => f(response)
      ) as any;
      return options?.transformClient
        ? (request) =>
            Effect.flatMap(
              Effect.flatMap(options.transformClient!(httpClient), (client) =>
                client.execute(request),
              ),
              withOptionalResponse,
            )
        : (request) => Effect.flatMap(httpClient.execute(request), withOptionalResponse);
    };
  const decodeSuccess =
    <Schema extends Schema.Top>(schema: Schema) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      HttpClientResponse.schemaBodyJson(schema)(response);
  const decodeError =
    <const Tag extends string, Schema extends Schema.Top>(tag: Tag, schema: Schema) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)(response), (cause) =>
        Effect.fail(RegistryClientError(tag, cause, response)),
      );
  return {
    httpClient,
    MetaGet: (options) =>
      HttpClientRequest.get(`/v1`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(MetaGet200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthIssueDeviceCode: (options) =>
      HttpClientRequest.post(`/v1/auth/device/code`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(AuthIssueDeviceCode200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthExchangeDeviceCode: (options) =>
      HttpClientRequest.post(`/v1/auth/device/token`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(AuthExchangeDeviceCode200),
            "400": decodeError("AuthExchangeDeviceCode400", AuthExchangeDeviceCode400),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthRefreshToken: (options) =>
      HttpClientRequest.post(`/v1/auth/token/refresh`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(AuthRefreshToken200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthRevokeToken: (options) =>
      HttpClientRequest.post(`/v1/auth/token/revoke`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "200": () => Effect.void,
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthGetMe: (options) =>
      HttpClientRequest.get(`/v1/auth/me`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(AuthGetMe200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthExchangeOidcToken: (options) =>
      HttpClientRequest.post(`/v1/auth/oidc/exchange`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "204": () => Effect.void,
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    TokensList: (options) =>
      HttpClientRequest.get(`/v1/tokens`).pipe(
        HttpClientRequest.setUrlParams({
          cursor: options?.params?.["cursor"] as any,
          limit: options?.params?.["limit"] as any,
        }),
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(TokensList200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    TokensCreate: (options) =>
      HttpClientRequest.post(`/v1/tokens`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(TokensCreate201),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    TokensDelete: (tokenId, options) =>
      HttpClientRequest.delete(`/v1/tokens/${tokenId}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "204": () => Effect.void,
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsListByProfile: (handle, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsListByProfile200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsListByType: (handle, type, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/${type}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsListByType200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsGet: (handle, type, name, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/${type}/${name}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsGet200),
            "304": () => Effect.void,
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsHead: (handle, type, name, options) =>
      HttpClientRequest.head(`/v1/extensions/${handle}/${type}/${name}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "200": () => Effect.void,
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsUpdateVisibility: (handle, type, name, options) =>
      HttpClientRequest.patch(`/v1/extensions/${handle}/${type}/${name}`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsUpdateVisibility200),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsGetVersion: (handle, type, name, version, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/${type}/${name}/${version}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsGetVersion200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsPublishVersion: (handle, type, name, version, options) =>
      HttpClientRequest.put(`/v1/extensions/${handle}/${type}/${name}/${version}`).pipe(
        HttpClientRequest.bodyFormData(options.payload as any),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "200": decodeSuccess(ExtensionsPublishVersion200),
            "201": decodeSuccess(ExtensionsPublishVersion201),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsDeleteVersion: (handle, type, name, version, options) =>
      HttpClientRequest.delete(`/v1/extensions/${handle}/${type}/${name}/${version}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "204": () => Effect.void,
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsDownloadArchive: (handle, type, name, version, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/${type}/${name}/${version}/archive`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsGetHandleProfile: (handle, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/profile`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsGetHandleProfile200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsDeprecate: (handle, type, name, options) =>
      HttpClientRequest.post(`/v1/extensions/${handle}/${type}/${name}/deprecate`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsDeprecate200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsUndeprecate: (handle, type, name, options) =>
      HttpClientRequest.delete(`/v1/extensions/${handle}/${type}/${name}/deprecate`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsUndeprecate200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsYankVersion: (handle, type, name, version, options) =>
      HttpClientRequest.post(`/v1/extensions/${handle}/${type}/${name}/${version}/yank`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsYankVersion200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsUnyankVersion: (handle, type, name, version, options) =>
      HttpClientRequest.delete(`/v1/extensions/${handle}/${type}/${name}/${version}/yank`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsUnyankVersion200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    CollaboratorsListCollaborators: (handle, type, name, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/${type}/${name}/collaborators`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(CollaboratorsListCollaborators200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    CollaboratorsUpsertCollaborator: (handle, type, name, userId, options) =>
      HttpClientRequest.put(
        `/v1/extensions/${handle}/${type}/${name}/collaborators/${userId}`,
      ).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(CollaboratorsUpsertCollaborator200),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    CollaboratorsDeleteCollaborator: (handle, type, name, userId, options) =>
      HttpClientRequest.delete(
        `/v1/extensions/${handle}/${type}/${name}/collaborators/${userId}`,
      ).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "204": () => Effect.void,
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    HealthGetShallowHealth: (options) =>
      HttpClientRequest.get(`/v1/health`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(HealthGetShallowHealth200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    HealthGetDeepHealth: (options) =>
      HttpClientRequest.get(`/v1/health/dependencies`).pipe(
        HttpClientRequest.setHeaders({
          "x-health-key": options?.params?.["x-health-key"] ?? undefined,
        }),
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(HealthGetDeepHealth200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    HealthGetObservabilityVerification: (options) =>
      HttpClientRequest.get(`/v1/debug/observability`).pipe(
        HttpClientRequest.setUrlParams({ level: options?.params?.["level"] as any }),
        HttpClientRequest.setHeaders({
          "x-health-key": options?.params?.["x-health-key"] ?? undefined,
        }),
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(HealthGetObservabilityVerification200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    SearchSearchExtensions: (options) =>
      HttpClientRequest.get(`/v1/search`).pipe(
        HttpClientRequest.setUrlParams({ q: options.params["q"] as any }),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(SearchSearchExtensions200),
            "400": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
  };
};

export interface RegistryClient {
  readonly httpClient: HttpClient.HttpClient;
  /**
   * Returns service metadata and documentation entrypoints when docs are enabled.
   */
  readonly MetaGet: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof MetaGet200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Initiate OAuth device authorization flow
   */
  readonly AuthIssueDeviceCode: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof AuthIssueDeviceCode200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Exchange device code for access token (RFC 8628 polling)
   */
  readonly AuthExchangeDeviceCode: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof AuthExchangeDeviceCode200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthExchangeDeviceCode400", typeof AuthExchangeDeviceCode400.Type>
  >;
  /**
   * Exchange refresh token for new token pair
   */
  readonly AuthRefreshToken: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof AuthRefreshToken200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Revoke an authentication token
   */
  readonly AuthRevokeToken: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Return authenticated user info
   */
  readonly AuthGetMe: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof AuthGetMe200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Exchange OIDC token (reserved, not implemented)
   */
  readonly AuthExchangeOidcToken: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * List access tokens
   */
  readonly TokensList: <Config extends OperationConfig>(
    options:
      | {
          readonly params?: typeof TokensListParams.Encoded | undefined;
          readonly config?: Config | undefined;
        }
      | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof TokensList200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Create scoped access token
   */
  readonly TokensCreate: <Config extends OperationConfig>(options: {
    readonly payload: typeof TokensCreateRequestJson.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<typeof TokensCreate201.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Revoke access token
   */
  readonly TokensDelete: <Config extends OperationConfig>(
    tokenId: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * List profile extensions
   */
  readonly ExtensionsListByProfile: <Config extends OperationConfig>(
    handle: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsListByProfile200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * List extensions by profile and type
   */
  readonly ExtensionsListByType: <Config extends OperationConfig>(
    handle: string,
    type: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsListByType200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Get extension metadata
   */
  readonly ExtensionsGet: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsGet200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Check whether an extension exists
   */
  readonly ExtensionsHead: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Update extension visibility
   */
  readonly ExtensionsUpdateVisibility: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    options: {
      readonly payload: typeof ExtensionsUpdateVisibilityRequestJson.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsUpdateVisibility200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Get extension version metadata
   */
  readonly ExtensionsGetVersion: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    version: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsGetVersion200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Publish extension version
   */
  readonly ExtensionsPublishVersion: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    version: string,
    options: {
      readonly payload: typeof ExtensionsPublishVersionRequestFormData.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<
      typeof ExtensionsPublishVersion200.Type | typeof ExtensionsPublishVersion201.Type,
      Config
    >,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Hard-delete an extension version
   */
  readonly ExtensionsDeleteVersion: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    version: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Download extension archive
   */
  readonly ExtensionsDownloadArchive: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    version: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Returns the current mock handle profile payload.
   */
  readonly ExtensionsGetHandleProfile: <Config extends OperationConfig>(
    handle: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsGetHandleProfile200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Deprecate an extension
   */
  readonly ExtensionsDeprecate: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    options: {
      readonly payload: typeof ExtensionsDeprecateRequestJson.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsDeprecate200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Un-deprecate an extension
   */
  readonly ExtensionsUndeprecate: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsUndeprecate200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Yank an extension version
   */
  readonly ExtensionsYankVersion: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    version: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsYankVersion200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Un-yank an extension version
   */
  readonly ExtensionsUnyankVersion: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    version: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsUnyankVersion200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * List extension collaborators
   */
  readonly CollaboratorsListCollaborators: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof CollaboratorsListCollaborators200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Add or update collaborator
   */
  readonly CollaboratorsUpsertCollaborator: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    userId: string,
    options: {
      readonly payload: typeof CollaboratorsUpsertCollaboratorRequestJson.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof CollaboratorsUpsertCollaborator200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Remove collaborator
   */
  readonly CollaboratorsDeleteCollaborator: <Config extends OperationConfig>(
    handle: string,
    type: string,
    name: string,
    userId: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Returns pass/fail status. Public, no auth required.
   */
  readonly HealthGetShallowHealth: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof HealthGetShallowHealth200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Returns IETF health+json response with per-dependency check results. Requires X-Health-Key header.
   */
  readonly HealthGetDeepHealth: <Config extends OperationConfig>(
    options:
      | {
          readonly params?: typeof HealthGetDeepHealthParams.Encoded | undefined;
          readonly config?: Config | undefined;
        }
      | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof HealthGetDeepHealth200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Exercises observability pipelines and returns correlation identifiers. Requires X-Health-Key header.
   */
  readonly HealthGetObservabilityVerification: <Config extends OperationConfig>(
    options:
      | {
          readonly params?: typeof HealthGetObservabilityVerificationParams.Encoded | undefined;
          readonly config?: Config | undefined;
        }
      | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof HealthGetObservabilityVerification200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
  /**
   * Returns the current mock search response for the provided query string.
   */
  readonly SearchSearchExtensions: <Config extends OperationConfig>(options: {
    readonly params: typeof SearchSearchExtensionsParams.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<typeof SearchSearchExtensions200.Type, Config>,
    HttpClientError.HttpClientError | SchemaError
  >;
}

export interface RegistryClientError<Tag extends string, E> {
  readonly _tag: Tag;
  readonly request: HttpClientRequest.HttpClientRequest;
  readonly response: HttpClientResponse.HttpClientResponse;
  readonly cause: E;
}

class RegistryClientErrorImpl extends Data.Error<{
  _tag: string;
  cause: any;
  request: HttpClientRequest.HttpClientRequest;
  response: HttpClientResponse.HttpClientResponse;
}> {}

export const RegistryClientError = <Tag extends string, E>(
  tag: Tag,
  cause: E,
  response: HttpClientResponse.HttpClientResponse,
): RegistryClientError<Tag, E> =>
  new RegistryClientErrorImpl({
    _tag: tag,
    cause,
    response,
    request: response.request,
  }) as any;
