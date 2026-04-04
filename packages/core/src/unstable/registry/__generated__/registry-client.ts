// Generated from specs/registry-openapi.json — do not edit by hand.
// Regenerate: pnpm generate

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { SchemaError } from "effect/Schema";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
// non-recursive definitions
export type DecodeErrorResponse = {
  readonly kind: "DecodeErrorResponse";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
};
export const DecodeErrorResponse = Schema.Struct({
  kind: Schema.Literal("DecodeErrorResponse"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
});
export type InvalidRequestError = {
  readonly kind: "InvalidRequestError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?: {
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
    readonly requiredScope?: string;
    readonly tokenScopes?: ReadonlyArray<string>;
    readonly requiredRole?: string | null;
  };
};
export const InvalidRequestError = Schema.Struct({
  kind: Schema.Literal("InvalidRequestError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Struct({
      retryable: Schema.Boolean,
      retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
      requiredScope: Schema.optionalKey(Schema.String),
      tokenScopes: Schema.optionalKey(Schema.Array(Schema.String)),
      requiredRole: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
export type RefreshTokenError = {
  readonly kind: "RefreshTokenError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?: unknown;
};
export const RefreshTokenError = Schema.Struct({
  kind: Schema.Literal("RefreshTokenError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(Schema.Unknown),
});
export type UserId = string;
export const UserId = Schema.String.check(
  Schema.isPattern(new RegExp("^user_[0-7][0-9a-hjkmnp-tv-z]{25}$"), {
    title: "User ID",
    description:
      "Identifies a registered user account. Assigned at sign-up and referenced by tokens, memberships, and audit trails.",
    examples: ["user_01h455vb4pexka56gq5w2r7cpc"],
  }),
);
export type TokenId = string;
export const TokenId = Schema.String.check(
  Schema.isPattern(new RegExp("^tok_[0-7][0-9a-hjkmnp-tv-z]{25}$"), {
    title: "Token ID",
    description:
      "Identifies an access token or personal access token (PAT) issued to a user. Used to authenticate API requests to the registry.",
    examples: ["tok_01h455vb4pexka56gq5w2r7cpc"],
  }),
);
export type UnauthorizedError = {
  readonly kind: "UnauthorizedError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
};
export const UnauthorizedError = Schema.Struct({
  kind: Schema.Literal("UnauthorizedError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
});
export type NotImplementedError = {
  readonly kind: "NotImplementedError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?: {
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
    readonly requiredScope?: string;
    readonly tokenScopes?: ReadonlyArray<string>;
    readonly requiredRole?: string | null;
  };
};
export const NotImplementedError = Schema.Struct({
  kind: Schema.Literal("NotImplementedError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Struct({
      retryable: Schema.Boolean,
      retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
      requiredScope: Schema.optionalKey(Schema.String),
      tokenScopes: Schema.optionalKey(Schema.Array(Schema.String)),
      requiredRole: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
export type ForbiddenError = {
  readonly kind: "ForbiddenError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?:
    | { readonly requiredScope: string; readonly grantedScopes: ReadonlyArray<string> }
    | {
        readonly requiredScope: string;
        readonly tokenScopes: ReadonlyArray<string>;
        readonly requiredRole?: string;
      }
    | {
        readonly retryable: boolean;
        readonly retryAfterSeconds?: number;
        readonly requiredScope?: string;
        readonly tokenScopes?: ReadonlyArray<string>;
        readonly requiredRole?: string | null;
      };
};
export const ForbiddenError = Schema.Struct({
  kind: Schema.Literal("ForbiddenError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({ requiredScope: Schema.String, grantedScopes: Schema.Array(Schema.String) }),
      Schema.Struct({
        requiredScope: Schema.String,
        tokenScopes: Schema.Array(Schema.String),
        requiredRole: Schema.optionalKey(Schema.String),
      }),
      Schema.Struct({
        retryable: Schema.Boolean,
        retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
        requiredScope: Schema.optionalKey(Schema.String),
        tokenScopes: Schema.optionalKey(Schema.Array(Schema.String)),
        requiredRole: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      }),
    ]),
  ),
});
export type UnprocessableEntityError = {
  readonly kind: "UnprocessableEntityError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?: {
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
    readonly requiredScope?: string;
    readonly tokenScopes?: ReadonlyArray<string>;
    readonly requiredRole?: string | null;
  };
};
export const UnprocessableEntityError = Schema.Struct({
  kind: Schema.Literal("UnprocessableEntityError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Struct({
      retryable: Schema.Boolean,
      retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
      requiredScope: Schema.optionalKey(Schema.String),
      tokenScopes: Schema.optionalKey(Schema.Array(Schema.String)),
      requiredRole: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
export type NotFoundError = {
  readonly kind: "NotFoundError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?: {
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
    readonly requiredScope?: string;
    readonly tokenScopes?: ReadonlyArray<string>;
    readonly requiredRole?: string | null;
  };
};
export const NotFoundError = Schema.Struct({
  kind: Schema.Literal("NotFoundError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Struct({
      retryable: Schema.Boolean,
      retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
      requiredScope: Schema.optionalKey(Schema.String),
      tokenScopes: Schema.optionalKey(Schema.Array(Schema.String)),
      requiredRole: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
export type InternalError = {
  readonly kind: "InternalError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?: {
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
    readonly requiredScope?: string;
    readonly tokenScopes?: ReadonlyArray<string>;
    readonly requiredRole?: string | null;
  };
};
export const InternalError = Schema.Struct({
  kind: Schema.Literal("InternalError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Struct({
      retryable: Schema.Boolean,
      retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
      requiredScope: Schema.optionalKey(Schema.String),
      tokenScopes: Schema.optionalKey(Schema.Array(Schema.String)),
      requiredRole: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
export type ExtensionId = string;
export const ExtensionId = Schema.String.check(
  Schema.isPattern(new RegExp("^ext_[0-7][0-9a-hjkmnp-tv-z]{25}$"), {
    title: "Extension ID",
    description:
      "Identifies a registered extension in the registry. An extension groups all published versions under a single handle, type, and name.",
    examples: ["ext_01h455vb4pexka56gq5w2r7cpc"],
  }),
);
export type ConflictError = {
  readonly kind: "ConflictError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?: {
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
    readonly requiredScope?: string;
    readonly tokenScopes?: ReadonlyArray<string>;
    readonly requiredRole?: string | null;
  };
};
export const ConflictError = Schema.Struct({
  kind: Schema.Literal("ConflictError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Struct({
      retryable: Schema.Boolean,
      retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
      requiredScope: Schema.optionalKey(Schema.String),
      tokenScopes: Schema.optionalKey(Schema.Array(Schema.String)),
      requiredRole: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
export type PayloadTooLargeError = {
  readonly kind: "PayloadTooLargeError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?: {
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
    readonly requiredScope?: string;
    readonly tokenScopes?: ReadonlyArray<string>;
    readonly requiredRole?: string | null;
  };
};
export const PayloadTooLargeError = Schema.Struct({
  kind: Schema.Literal("PayloadTooLargeError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Struct({
      retryable: Schema.Boolean,
      retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
      requiredScope: Schema.optionalKey(Schema.String),
      tokenScopes: Schema.optionalKey(Schema.Array(Schema.String)),
      requiredRole: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
export type UnsupportedMediaTypeError = {
  readonly kind: "UnsupportedMediaTypeError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?: {
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
    readonly requiredScope?: string;
    readonly tokenScopes?: ReadonlyArray<string>;
    readonly requiredRole?: string | null;
  };
};
export const UnsupportedMediaTypeError = Schema.Struct({
  kind: Schema.Literal("UnsupportedMediaTypeError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Struct({
      retryable: Schema.Boolean,
      retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
      requiredScope: Schema.optionalKey(Schema.String),
      tokenScopes: Schema.optionalKey(Schema.Array(Schema.String)),
      requiredRole: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
export type TooManyRequestsError = {
  readonly kind: "TooManyRequestsError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?: {
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
    readonly requiredScope?: string;
    readonly tokenScopes?: ReadonlyArray<string>;
    readonly requiredRole?: string | null;
  };
};
export const TooManyRequestsError = Schema.Struct({
  kind: Schema.Literal("TooManyRequestsError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Struct({
      retryable: Schema.Boolean,
      retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
      requiredScope: Schema.optionalKey(Schema.String),
      tokenScopes: Schema.optionalKey(Schema.Array(Schema.String)),
      requiredRole: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
export type ServiceUnavailableError = {
  readonly kind: "ServiceUnavailableError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly instance?: string;
  readonly details?: {
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number;
    readonly requiredScope?: string;
    readonly tokenScopes?: ReadonlyArray<string>;
    readonly requiredRole?: string | null;
  };
};
export const ServiceUnavailableError = Schema.Struct({
  kind: Schema.Literal("ServiceUnavailableError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  code: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Struct({
      retryable: Schema.Boolean,
      retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isFinite())),
      requiredScope: Schema.optionalKey(Schema.String),
      tokenScopes: Schema.optionalKey(Schema.Array(Schema.String)),
      requiredRole: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
    }),
  ),
});
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
export type MetaGet400 = DecodeErrorResponse;
export const MetaGet400 = DecodeErrorResponse;
export type AuthIssueDeviceCodeRequestFormUrlEncoded = {
  readonly client_id: "axm-cli";
  readonly scope?: string | null;
};
export const AuthIssueDeviceCodeRequestFormUrlEncoded = Schema.Struct({
  client_id: Schema.Literal("axm-cli"),
  scope: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
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
  device_code: Schema.String.annotate({
    description: "Device verification code for the polling client.",
  }),
  user_code: Schema.String.annotate({ description: "Short code the user enters in the browser." }),
  verification_uri: Schema.String.annotate({
    description: "URI where the user should navigate to enter the user code.",
    format: "uri",
  }),
  verification_uri_complete: Schema.String.annotate({
    description: "URI with the user code pre-filled, suitable for QR codes or direct links.",
    format: "uri",
  }),
  expires_in: Schema.Number.annotate({
    description: "Lifetime of the device code in seconds.",
  }).check(Schema.isInt()),
  interval: Schema.Number.annotate({ description: "Minimum polling interval in seconds." }).check(
    Schema.isInt(),
  ),
}).annotate({
  title: "Device Code Response",
  description: "Response from the OAuth device authorization endpoint (RFC 8628).",
});
export type AuthIssueDeviceCode400 = DecodeErrorResponse;
export const AuthIssueDeviceCode400 = DecodeErrorResponse;
export type AuthExchangeDeviceCodeRequestFormUrlEncoded = {
  readonly grant_type: string;
  readonly device_code: string;
  readonly client_id: string;
};
export const AuthExchangeDeviceCodeRequestFormUrlEncoded = Schema.Struct({
  grant_type: Schema.String,
  device_code: Schema.String,
  client_id: Schema.String,
});
export type AuthExchangeDeviceCode200 = {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: "Bearer";
  readonly expires_in: number;
  readonly expires_at: string;
  readonly scope?: string | null;
};
export const AuthExchangeDeviceCode200 = Schema.Struct({
  access_token: Schema.String.annotate({ description: "OAuth 2.0 access token." }),
  refresh_token: Schema.String.annotate({
    description: "OAuth 2.0 refresh token for obtaining new token pairs.",
  }),
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Number.annotate({
    description: "Access token lifetime remaining in seconds.",
  }).check(Schema.isInt()),
  expires_at: Schema.String.annotate({
    description: "ISO 8601 timestamp when the access token expires.",
    format: "date-time",
  }),
  scope: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({ description: "Space-delimited list of granted scopes." }),
      Schema.Null,
    ]),
  ),
}).annotate({
  title: "Session Token Response",
  description: "OAuth 2.0 token response containing an access/refresh token pair.",
});
export type AuthExchangeDeviceCode400 = InvalidRequestError | DecodeErrorResponse;
export const AuthExchangeDeviceCode400 = Schema.Union([InvalidRequestError, DecodeErrorResponse]);
export type AuthRefreshTokenRequestFormUrlEncoded = {
  readonly grant_type: "refresh_token";
  readonly refresh_token: string;
  readonly client_id?: string | null;
};
export const AuthRefreshTokenRequestFormUrlEncoded = Schema.Struct({
  grant_type: Schema.Literal("refresh_token"),
  refresh_token: Schema.String.check(Schema.isMinLength(1)),
  client_id: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type AuthRefreshToken200 = {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: "Bearer";
  readonly expires_in: number;
  readonly expires_at: string;
  readonly scope?: string | null;
};
export const AuthRefreshToken200 = Schema.Struct({
  access_token: Schema.String.annotate({ description: "OAuth 2.0 access token." }),
  refresh_token: Schema.String.annotate({
    description: "OAuth 2.0 refresh token for obtaining new token pairs.",
  }),
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Number.annotate({
    description: "Access token lifetime remaining in seconds.",
  }).check(Schema.isInt()),
  expires_at: Schema.String.annotate({
    description: "ISO 8601 timestamp when the access token expires.",
    format: "date-time",
  }),
  scope: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({ description: "Space-delimited list of granted scopes." }),
      Schema.Null,
    ]),
  ),
}).annotate({
  title: "Session Token Response",
  description: "OAuth 2.0 token response containing an access/refresh token pair.",
});
export type AuthRefreshToken400 = DecodeErrorResponse;
export const AuthRefreshToken400 = DecodeErrorResponse;
export type AuthRefreshToken401 = RefreshTokenError;
export const AuthRefreshToken401 = RefreshTokenError;
export type AuthRevokeTokenRequestFormUrlEncoded = { readonly token: string };
export const AuthRevokeTokenRequestFormUrlEncoded = Schema.Struct({
  token: Schema.String.check(Schema.isMinLength(1)),
});
export type AuthRevokeToken400 = DecodeErrorResponse;
export const AuthRevokeToken400 = DecodeErrorResponse;
export type AuthGetMe200 = {
  readonly user: { readonly id: UserId; readonly handle: string; readonly email: string | null };
  readonly orgs: ReadonlyArray<never>;
  readonly token: {
    readonly id: TokenId;
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
    id: TokenId,
    type: Schema.Literals(["session", "pat", "oidc"]),
    name: Schema.Union([Schema.String, Schema.Null]),
    scopes: Schema.Array(Schema.String),
    resource_restrictions: Schema.Struct({
      extensions: Schema.Union([Schema.Array(Schema.String), Schema.Null]),
    }),
    expires_at: Schema.String.annotate({ format: "date-time" }),
  }),
});
export type AuthGetMe400 = DecodeErrorResponse;
export const AuthGetMe400 = DecodeErrorResponse;
export type AuthGetMe401 = UnauthorizedError;
export const AuthGetMe401 = UnauthorizedError;
export type AuthExchangeOidcToken400 = DecodeErrorResponse;
export const AuthExchangeOidcToken400 = DecodeErrorResponse;
export type AuthExchangeOidcToken501 = NotImplementedError;
export const AuthExchangeOidcToken501 = NotImplementedError;
export type TokensListParams = { readonly cursor?: string | null; readonly limit?: string | null };
export const TokensListParams = Schema.Struct({
  cursor: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  limit: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type TokensList200 = {
  readonly tokens: ReadonlyArray<{
    readonly id: TokenId;
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
      id: TokenId,
      name: Schema.Union([Schema.String, Schema.Null]),
      type: Schema.String,
      scopes: Schema.Array(Schema.String),
      created_at: Schema.String.annotate({ readOnly: true, format: "date-time" }),
      expires_at: Schema.String.annotate({ readOnly: true, format: "date-time" }),
      last_used_at: Schema.Union([
        Schema.String.annotate({ readOnly: true, format: "date-time" }),
        Schema.Null,
      ]),
    }),
  ),
  has_more: Schema.Boolean,
  cursor: Schema.Union([Schema.String, Schema.Null]),
});
export type TokensList400 = DecodeErrorResponse;
export const TokensList400 = DecodeErrorResponse;
export type TokensList401 = UnauthorizedError;
export const TokensList401 = UnauthorizedError;
export type TokensList403 = ForbiddenError;
export const TokensList403 = ForbiddenError;
export type TokensCreateRequestJson = {
  readonly name: string;
  readonly scopes: ReadonlyArray<string>;
  readonly expires_in: number;
};
export const TokensCreateRequestJson = Schema.Struct({
  name: Schema.String.check(
    Schema.isMinLength(1, { description: "Human-readable name for the token." }),
  ),
  scopes: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
  expires_in: Schema.Number.check(Schema.isInt())
    .check(Schema.isFinite())
    .check(Schema.isGreaterThanOrEqualTo(3600))
    .check(
      Schema.isLessThanOrEqualTo(31536000, {
        description: "Token lifetime in seconds (3600–31536000).",
      }),
    ),
}).annotate({
  title: "Create Token Request",
  description: "Request body for creating a new personal access token.",
});
export type TokensCreate201 = {
  readonly id: TokenId;
  readonly token: string;
  readonly name: string;
  readonly scopes: ReadonlyArray<string>;
  readonly created_at: string;
  readonly expires_at: string;
};
export const TokensCreate201 = Schema.Struct({
  id: TokenId,
  token: Schema.String.annotate({
    description: "The full token value. Only returned once at creation time.",
    readOnly: true,
  }),
  name: Schema.String,
  scopes: Schema.Array(Schema.String),
  created_at: Schema.String.annotate({ readOnly: true, format: "date-time" }),
  expires_at: Schema.String.annotate({ readOnly: true, format: "date-time" }),
}).annotate({
  title: "Create Token Response",
  description: "Newly created personal access token with the plaintext token value.",
});
export type TokensCreate400 = DecodeErrorResponse;
export const TokensCreate400 = DecodeErrorResponse;
export type TokensCreate401 = UnauthorizedError;
export const TokensCreate401 = UnauthorizedError;
export type TokensCreate403 = ForbiddenError;
export const TokensCreate403 = ForbiddenError;
export type TokensCreate422 = UnprocessableEntityError;
export const TokensCreate422 = UnprocessableEntityError;
export type TokensDelete400 = DecodeErrorResponse;
export const TokensDelete400 = DecodeErrorResponse;
export type TokensDelete401 = UnauthorizedError;
export const TokensDelete401 = UnauthorizedError;
export type TokensDelete403 = ForbiddenError;
export const TokensDelete403 = ForbiddenError;
export type ExtensionsListByProfile200 = {
  readonly extensions: ReadonlyArray<{
    readonly name: string;
    readonly owner: string;
    readonly type: "skill" | "command" | "mcp-server" | "subagent" | "file" | "rule" | "pack";
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
      owner: Schema.String,
      type: Schema.Literals(["skill", "command", "mcp-server", "subagent", "file", "rule", "pack"]),
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
      visibility: Schema.optionalKey(
        Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
      ),
      deprecated_at: Schema.optionalKey(
        Schema.Union([
          Schema.String.annotate({ readOnly: true, format: "date-time" }),
          Schema.Null,
        ]),
      ),
      deprecation_notice: Schema.optionalKey(
        Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
      ),
    }),
  ),
});
export type ExtensionsListByProfile400 = DecodeErrorResponse;
export const ExtensionsListByProfile400 = DecodeErrorResponse;
export type ExtensionsListByType200 = {
  readonly extensions: ReadonlyArray<{
    readonly name: string;
    readonly owner: string;
    readonly type: "skill" | "command" | "mcp-server" | "subagent" | "file" | "rule" | "pack";
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
      owner: Schema.String,
      type: Schema.Literals(["skill", "command", "mcp-server", "subagent", "file", "rule", "pack"]),
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
      visibility: Schema.optionalKey(
        Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
      ),
      deprecated_at: Schema.optionalKey(
        Schema.Union([
          Schema.String.annotate({ readOnly: true, format: "date-time" }),
          Schema.Null,
        ]),
      ),
      deprecation_notice: Schema.optionalKey(
        Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
      ),
    }),
  ),
});
export type ExtensionsListByType400 = DecodeErrorResponse;
export const ExtensionsListByType400 = DecodeErrorResponse;
export type ExtensionsGet200 = {
  readonly name: string;
  readonly owner: string;
  readonly type: "skill" | "command" | "mcp-server" | "subagent" | "file" | "rule" | "pack";
  readonly description?: string | null;
  readonly repository?: string | null;
  readonly license?: string | null;
  readonly authors?: ReadonlyArray<{
    readonly name?: string | null;
    readonly email?: string | null;
    readonly url?: string | null;
  }> | null;
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
  owner: Schema.String,
  type: Schema.Literals(["skill", "command", "mcp-server", "subagent", "file", "rule", "pack"]),
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
  versions: Schema.Array(
    Schema.Struct({
      version: Schema.String,
      published: Schema.String.annotate({ readOnly: true, format: "date-time" }),
      integrity: Schema.String.annotate({ readOnly: true }),
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
      yanked_at: Schema.optionalKey(
        Schema.Union([
          Schema.String.annotate({ readOnly: true, format: "date-time" }),
          Schema.Null,
        ]),
      ),
    }),
  ),
  visibility: Schema.optionalKey(
    Schema.Union([
      Schema.Literals(["public", "unlisted", "private"]).annotate({ readOnly: true }),
      Schema.Null,
    ]),
  ),
  deprecated_at: Schema.optionalKey(
    Schema.Union([Schema.String.annotate({ readOnly: true, format: "date-time" }), Schema.Null]),
  ),
  deprecation_notice: Schema.optionalKey(
    Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
  ),
});
export type ExtensionsGet400 = DecodeErrorResponse;
export const ExtensionsGet400 = DecodeErrorResponse;
export type ExtensionsGet404 = NotFoundError;
export const ExtensionsGet404 = NotFoundError;
export type ExtensionsUpdateVisibilityRequestJson = {
  readonly visibility: "public" | "unlisted" | "private";
};
export const ExtensionsUpdateVisibilityRequestJson = Schema.Struct({
  visibility: Schema.Literals(["public", "unlisted", "private"]),
});
export type ExtensionsUpdateVisibility200 = {
  readonly id: ExtensionId;
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly visibility: string;
  readonly updatedAt: string;
};
export const ExtensionsUpdateVisibility200 = Schema.Struct({
  id: ExtensionId,
  owner: Schema.String,
  type: Schema.String,
  name: Schema.String,
  visibility: Schema.String,
  updatedAt: Schema.String.annotate({ readOnly: true, format: "date-time" }),
});
export type ExtensionsUpdateVisibility400 = InvalidRequestError | DecodeErrorResponse;
export const ExtensionsUpdateVisibility400 = Schema.Union([
  InvalidRequestError,
  DecodeErrorResponse,
]);
export type ExtensionsUpdateVisibility401 = UnauthorizedError;
export const ExtensionsUpdateVisibility401 = UnauthorizedError;
export type ExtensionsUpdateVisibility403 = ForbiddenError;
export const ExtensionsUpdateVisibility403 = ForbiddenError;
export type ExtensionsUpdateVisibility404 = NotFoundError;
export const ExtensionsUpdateVisibility404 = NotFoundError;
export type ExtensionsGetVersion200 = {
  readonly name: string;
  readonly owner: string;
  readonly type: string;
  readonly version: string;
  readonly status: "pending" | "available" | "failed";
  readonly published: string;
  readonly integrity: string;
  readonly description?: string | null;
  readonly repository?: string | null;
  readonly license?: string | null;
  readonly authors?: ReadonlyArray<{
    readonly name?: string | null;
    readonly email?: string | null;
    readonly url?: string | null;
  }> | null;
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
  owner: Schema.String,
  type: Schema.String,
  version: Schema.String,
  status: Schema.Literals(["pending", "available", "failed"]).annotate({ readOnly: true }),
  published: Schema.String.annotate({ readOnly: true, format: "date-time" }),
  integrity: Schema.String.annotate({ readOnly: true }),
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
  yanked_at: Schema.optionalKey(
    Schema.Union([Schema.String.annotate({ readOnly: true, format: "date-time" }), Schema.Null]),
  ),
  deleted_at: Schema.optionalKey(
    Schema.Union([Schema.String.annotate({ readOnly: true, format: "date-time" }), Schema.Null]),
  ),
});
export type ExtensionsGetVersion400 = DecodeErrorResponse;
export const ExtensionsGetVersion400 = DecodeErrorResponse;
export type ExtensionsGetVersion404 = NotFoundError;
export const ExtensionsGetVersion404 = NotFoundError;
export type ExtensionsPublishVersionRequestFormData = {
  readonly archive: string;
  readonly integrity?: string | null;
};
export const ExtensionsPublishVersionRequestFormData = Schema.Struct({
  archive: Schema.String.annotate({ description: "Extension archive multipart file part." }),
  integrity: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type ExtensionsPublishVersion200 = {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
  readonly sha256_hex: string;
  readonly published_at: string;
  readonly publish_status: string;
};
export const ExtensionsPublishVersion200 = Schema.Struct({
  owner: Schema.String,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
  integrity: Schema.String.annotate({ readOnly: true }),
  sha256_hex: Schema.String.annotate({ readOnly: true }),
  published_at: Schema.String.annotate({ readOnly: true, format: "date-time" }),
  publish_status: Schema.String.annotate({ readOnly: true }),
});
export type ExtensionsPublishVersion201 = {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
  readonly sha256_hex: string;
  readonly published_at: string;
  readonly publish_status: string;
};
export const ExtensionsPublishVersion201 = Schema.Struct({
  owner: Schema.String,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
  integrity: Schema.String.annotate({ readOnly: true }),
  sha256_hex: Schema.String.annotate({ readOnly: true }),
  published_at: Schema.String.annotate({ readOnly: true, format: "date-time" }),
  publish_status: Schema.String.annotate({ readOnly: true }),
});
export type ExtensionsPublishVersion400 = InvalidRequestError | DecodeErrorResponse;
export const ExtensionsPublishVersion400 = Schema.Union([InvalidRequestError, DecodeErrorResponse]);
export type ExtensionsPublishVersion401 = UnauthorizedError;
export const ExtensionsPublishVersion401 = UnauthorizedError;
export type ExtensionsPublishVersion403 = ForbiddenError;
export const ExtensionsPublishVersion403 = ForbiddenError;
export type ExtensionsPublishVersion404 = NotFoundError;
export const ExtensionsPublishVersion404 = NotFoundError;
export type ExtensionsPublishVersion409 = ConflictError;
export const ExtensionsPublishVersion409 = ConflictError;
export type ExtensionsPublishVersion413 = PayloadTooLargeError;
export const ExtensionsPublishVersion413 = PayloadTooLargeError;
export type ExtensionsPublishVersion415 = UnsupportedMediaTypeError;
export const ExtensionsPublishVersion415 = UnsupportedMediaTypeError;
export type ExtensionsPublishVersion422 = UnprocessableEntityError;
export const ExtensionsPublishVersion422 = UnprocessableEntityError;
export type ExtensionsPublishVersion429 = TooManyRequestsError;
export const ExtensionsPublishVersion429 = TooManyRequestsError;
export type ExtensionsPublishVersion500 = InternalError;
export const ExtensionsPublishVersion500 = InternalError;
export type ExtensionsPublishVersion501 = NotImplementedError;
export const ExtensionsPublishVersion501 = NotImplementedError;
export type ExtensionsPublishVersion503 = ServiceUnavailableError;
export const ExtensionsPublishVersion503 = ServiceUnavailableError;
export type ExtensionsDeleteVersion400 = DecodeErrorResponse;
export const ExtensionsDeleteVersion400 = DecodeErrorResponse;
export type ExtensionsDeleteVersion401 = UnauthorizedError;
export const ExtensionsDeleteVersion401 = UnauthorizedError;
export type ExtensionsDeleteVersion403 = ForbiddenError;
export const ExtensionsDeleteVersion403 = ForbiddenError;
export type ExtensionsDeleteVersion404 = NotFoundError;
export const ExtensionsDeleteVersion404 = NotFoundError;
export type ExtensionsDownloadArchive400 = DecodeErrorResponse;
export const ExtensionsDownloadArchive400 = DecodeErrorResponse;
export type ExtensionsDownloadArchive404 = NotFoundError;
export const ExtensionsDownloadArchive404 = NotFoundError;
export type ExtensionsDownloadArchive500 = InternalError;
export const ExtensionsDownloadArchive500 = InternalError;
export type ExtensionsGetHandleProfile200 = {
  readonly ok: true;
  readonly mock: true;
  readonly method: "GET";
  readonly route: "/v1/extensions/{handle}/owner";
  readonly message: string;
  readonly params: { readonly handle: string };
};
export const ExtensionsGetHandleProfile200 = Schema.Struct({
  ok: Schema.Literal(true),
  mock: Schema.Literal(true),
  method: Schema.Literal("GET"),
  route: Schema.Literal("/v1/extensions/{handle}/owner"),
  message: Schema.String,
  params: Schema.Struct({ handle: Schema.String }),
});
export type ExtensionsGetHandleProfile400 = DecodeErrorResponse;
export const ExtensionsGetHandleProfile400 = DecodeErrorResponse;
export type ExtensionsDeprecateRequestJson = { readonly notice?: string | null };
export const ExtensionsDeprecateRequestJson = Schema.Struct({
  notice: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type ExtensionsDeprecate200 = {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly deprecatedAt: string | null;
  readonly deprecationNotice: string | null;
};
export const ExtensionsDeprecate200 = Schema.Struct({
  owner: Schema.String,
  type: Schema.String,
  name: Schema.String,
  deprecatedAt: Schema.Union([
    Schema.String.annotate({ readOnly: true, format: "date-time" }),
    Schema.Null,
  ]),
  deprecationNotice: Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
});
export type ExtensionsDeprecate400 = DecodeErrorResponse;
export const ExtensionsDeprecate400 = DecodeErrorResponse;
export type ExtensionsDeprecate401 = UnauthorizedError;
export const ExtensionsDeprecate401 = UnauthorizedError;
export type ExtensionsDeprecate403 = ForbiddenError;
export const ExtensionsDeprecate403 = ForbiddenError;
export type ExtensionsDeprecate404 = NotFoundError;
export const ExtensionsDeprecate404 = NotFoundError;
export type ExtensionsUndeprecate200 = {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly deprecatedAt: null;
  readonly deprecationNotice: null;
};
export const ExtensionsUndeprecate200 = Schema.Struct({
  owner: Schema.String,
  type: Schema.String,
  name: Schema.String,
  deprecatedAt: Schema.Null,
  deprecationNotice: Schema.Null,
});
export type ExtensionsUndeprecate400 = DecodeErrorResponse;
export const ExtensionsUndeprecate400 = DecodeErrorResponse;
export type ExtensionsUndeprecate401 = UnauthorizedError;
export const ExtensionsUndeprecate401 = UnauthorizedError;
export type ExtensionsUndeprecate403 = ForbiddenError;
export const ExtensionsUndeprecate403 = ForbiddenError;
export type ExtensionsUndeprecate404 = NotFoundError;
export const ExtensionsUndeprecate404 = NotFoundError;
export type ExtensionsYankVersion200 = {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly version: string;
  readonly yankedAt: string | null;
};
export const ExtensionsYankVersion200 = Schema.Struct({
  owner: Schema.String,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
  yankedAt: Schema.Union([
    Schema.String.annotate({ readOnly: true, format: "date-time" }),
    Schema.Null,
  ]),
});
export type ExtensionsYankVersion400 = DecodeErrorResponse;
export const ExtensionsYankVersion400 = DecodeErrorResponse;
export type ExtensionsYankVersion401 = UnauthorizedError;
export const ExtensionsYankVersion401 = UnauthorizedError;
export type ExtensionsYankVersion403 = ForbiddenError;
export const ExtensionsYankVersion403 = ForbiddenError;
export type ExtensionsYankVersion404 = NotFoundError;
export const ExtensionsYankVersion404 = NotFoundError;
export type ExtensionsUnyankVersion200 = {
  readonly owner: string;
  readonly type: string;
  readonly name: string;
  readonly version: string;
  readonly yankedAt: null;
};
export const ExtensionsUnyankVersion200 = Schema.Struct({
  owner: Schema.String,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
  yankedAt: Schema.Null,
});
export type ExtensionsUnyankVersion400 = DecodeErrorResponse;
export const ExtensionsUnyankVersion400 = DecodeErrorResponse;
export type ExtensionsUnyankVersion401 = UnauthorizedError;
export const ExtensionsUnyankVersion401 = UnauthorizedError;
export type ExtensionsUnyankVersion403 = ForbiddenError;
export const ExtensionsUnyankVersion403 = ForbiddenError;
export type ExtensionsUnyankVersion404 = NotFoundError;
export const ExtensionsUnyankVersion404 = NotFoundError;
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
      grantedBy: Schema.Union([UserId, Schema.Null]).annotate({ readOnly: true }),
      createdAt: Schema.String.annotate({ readOnly: true, format: "date-time" }),
    }),
  ),
});
export type CollaboratorsListCollaborators400 = DecodeErrorResponse;
export const CollaboratorsListCollaborators400 = DecodeErrorResponse;
export type CollaboratorsListCollaborators401 = UnauthorizedError;
export const CollaboratorsListCollaborators401 = UnauthorizedError;
export type CollaboratorsListCollaborators403 = ForbiddenError;
export const CollaboratorsListCollaborators403 = ForbiddenError;
export type CollaboratorsListCollaborators404 = NotFoundError;
export const CollaboratorsListCollaborators404 = NotFoundError;
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
  grantedBy: Schema.Union([UserId, Schema.Null]).annotate({ readOnly: true }),
  createdAt: Schema.String.annotate({ readOnly: true, format: "date-time" }),
});
export type CollaboratorsUpsertCollaborator400 = InvalidRequestError | DecodeErrorResponse;
export const CollaboratorsUpsertCollaborator400 = Schema.Union([
  InvalidRequestError,
  DecodeErrorResponse,
]);
export type CollaboratorsUpsertCollaborator401 = UnauthorizedError;
export const CollaboratorsUpsertCollaborator401 = UnauthorizedError;
export type CollaboratorsUpsertCollaborator403 = ForbiddenError;
export const CollaboratorsUpsertCollaborator403 = ForbiddenError;
export type CollaboratorsUpsertCollaborator404 = NotFoundError;
export const CollaboratorsUpsertCollaborator404 = NotFoundError;
export type CollaboratorsDeleteCollaborator400 = DecodeErrorResponse;
export const CollaboratorsDeleteCollaborator400 = DecodeErrorResponse;
export type CollaboratorsDeleteCollaborator401 = UnauthorizedError;
export const CollaboratorsDeleteCollaborator401 = UnauthorizedError;
export type CollaboratorsDeleteCollaborator403 = ForbiddenError;
export const CollaboratorsDeleteCollaborator403 = ForbiddenError;
export type CollaboratorsDeleteCollaborator404 = NotFoundError;
export const CollaboratorsDeleteCollaborator404 = NotFoundError;
export type CollaboratorsDeleteCollaborator409 = ConflictError;
export const CollaboratorsDeleteCollaborator409 = ConflictError;
export type HealthGetShallowHealth200 = { readonly status: "pass" | "warn" | "fail" };
export const HealthGetShallowHealth200 = Schema.Struct({
  status: Schema.Literals(["pass", "warn", "fail"]),
});
export type HealthGetShallowHealth400 = DecodeErrorResponse;
export const HealthGetShallowHealth400 = DecodeErrorResponse;
export type HealthGetDeepHealthParams = { readonly "x-health-key"?: string | null };
export const HealthGetDeepHealthParams = Schema.Struct({
  "x-health-key": Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type HealthGetDeepHealth200 = {
  readonly status: "pass" | "warn" | "fail";
  readonly serviceId?: string | null;
  readonly version?: string | null;
  readonly releaseId?: string | null;
  readonly commit?: string | null;
  readonly deployedAt?: string | null;
  readonly environment?: string | null;
  readonly region?: string | null;
  readonly checks?: {
    readonly [x: string]: ReadonlyArray<{
      readonly componentName: string;
      readonly componentType: "datastore" | "system" | "component";
      readonly measurementName: string;
      readonly status: "pass" | "warn" | "fail";
      readonly observedValue: number;
      readonly observedUnit: string;
      readonly time: string;
    }>;
  } | null;
  readonly output?: string | null;
};
export const HealthGetDeepHealth200 = Schema.Struct({
  status: Schema.Literals(["pass", "warn", "fail"]),
  serviceId: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  version: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  releaseId: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  commit: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  deployedAt: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  environment: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  region: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  checks: Schema.optionalKey(
    Schema.Union([
      Schema.Record(
        Schema.String,
        Schema.Array(
          Schema.Struct({
            componentName: Schema.String,
            componentType: Schema.Literals(["datastore", "system", "component"]),
            measurementName: Schema.String,
            status: Schema.Literals(["pass", "warn", "fail"]),
            observedValue: Schema.Number.check(Schema.isFinite()),
            observedUnit: Schema.String,
            time: Schema.String,
          }),
        ),
      ),
      Schema.Null,
    ]),
  ),
  output: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type HealthGetDeepHealth400 = DecodeErrorResponse;
export const HealthGetDeepHealth400 = DecodeErrorResponse;
export type HealthGetObservabilityVerificationParams = {
  readonly "x-health-key"?: string | null;
  readonly level?: string | null;
};
export const HealthGetObservabilityVerificationParams = Schema.Struct({
  "x-health-key": Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  level: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type HealthGetObservabilityVerification200 = {
  readonly status: "ok" | "error";
  readonly timestamp: string;
  readonly serviceId: string;
  readonly level: "basic" | "standard" | "full";
  readonly checks: {
    readonly logging?: { readonly status: "ok" | "error"; readonly correlationId: string } | null;
    readonly tracing?: { readonly status: "ok" | "error"; readonly traceId?: string | null } | null;
    readonly metrics?: { readonly status: "ok" | "error"; readonly counter: string } | null;
    readonly errors?: {
      readonly status: "ok" | "error";
      readonly sentryEventId?: string | null;
    } | null;
  };
};
export const HealthGetObservabilityVerification200 = Schema.Struct({
  status: Schema.Literals(["ok", "error"]),
  timestamp: Schema.String,
  serviceId: Schema.String,
  level: Schema.Literals(["basic", "standard", "full"]),
  checks: Schema.Struct({
    logging: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({ status: Schema.Literals(["ok", "error"]), correlationId: Schema.String }),
        Schema.Null,
      ]),
    ),
    tracing: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({
          status: Schema.Literals(["ok", "error"]),
          traceId: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
        }),
        Schema.Null,
      ]),
    ),
    metrics: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({ status: Schema.Literals(["ok", "error"]), counter: Schema.String }),
        Schema.Null,
      ]),
    ),
    errors: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({
          status: Schema.Literals(["ok", "error"]),
          sentryEventId: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
        }),
        Schema.Null,
      ]),
    ),
  }),
});
export type HealthGetObservabilityVerification400 = DecodeErrorResponse;
export const HealthGetObservabilityVerification400 = DecodeErrorResponse;
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
export type SearchSearchExtensions400 = DecodeErrorResponse;
export const SearchSearchExtensions400 = DecodeErrorResponse;

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
  const binaryRequest = (
    request: HttpClientRequest.HttpClientRequest,
  ): Stream.Stream<Uint8Array, HttpClientError.HttpClientError> =>
    HttpClient.filterStatusOk(httpClient)
      .execute(request)
      .pipe(
        Effect.map((response) => response.stream),
        Stream.unwrap,
      );
  const decodeBinary = (response: HttpClientResponse.HttpClientResponse) =>
    Effect.map(response.arrayBuffer, (buffer) => new Uint8Array(buffer));
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
  const decodeVoidError =
    <const Tag extends string>(tag: Tag) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      Effect.fail(RegistryClientError(tag, undefined, response));
  return {
    httpClient,
    MetaGet: (options) =>
      HttpClientRequest.get(`/v1`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(MetaGet200),
            "400": decodeError("MetaGet400", MetaGet400),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthIssueDeviceCode: (options) =>
      HttpClientRequest.post(`/v1/auth/device/code`).pipe(
        HttpClientRequest.bodyUrlParams(options.payload as any),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(AuthIssueDeviceCode200),
            "400": decodeError("AuthIssueDeviceCode400", AuthIssueDeviceCode400),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthExchangeDeviceCode: (options) =>
      HttpClientRequest.post(`/v1/auth/device/token`).pipe(
        HttpClientRequest.bodyUrlParams(options.payload as any),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(AuthExchangeDeviceCode200),
            "400": decodeError("AuthExchangeDeviceCode400", AuthExchangeDeviceCode400),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthRefreshToken: (options) =>
      HttpClientRequest.post(`/v1/auth/token/refresh`).pipe(
        HttpClientRequest.bodyUrlParams(options.payload as any),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(AuthRefreshToken200),
            "400": decodeError("AuthRefreshToken400", AuthRefreshToken400),
            "401": decodeError("AuthRefreshToken401", AuthRefreshToken401),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthRevokeToken: (options) =>
      HttpClientRequest.post(`/v1/auth/token/revoke`).pipe(
        HttpClientRequest.bodyUrlParams(options.payload as any),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "400": decodeError("AuthRevokeToken400", AuthRevokeToken400),
            "200": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthGetMe: (options) =>
      HttpClientRequest.get(`/v1/auth/me`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(AuthGetMe200),
            "400": decodeError("AuthGetMe400", AuthGetMe400),
            "401": decodeError("AuthGetMe401", AuthGetMe401),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthExchangeOidcToken: (options) =>
      HttpClientRequest.post(`/v1/auth/oidc/exchange`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "400": decodeError("AuthExchangeOidcToken400", AuthExchangeOidcToken400),
            "501": decodeError("AuthExchangeOidcToken501", AuthExchangeOidcToken501),
            "204": () => Effect.void,
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
            "400": decodeError("TokensList400", TokensList400),
            "401": decodeError("TokensList401", TokensList401),
            "403": decodeError("TokensList403", TokensList403),
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
            "400": decodeError("TokensCreate400", TokensCreate400),
            "401": decodeError("TokensCreate401", TokensCreate401),
            "403": decodeError("TokensCreate403", TokensCreate403),
            "422": decodeError("TokensCreate422", TokensCreate422),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    TokensDelete: (tokenId, options) =>
      HttpClientRequest.delete(`/v1/tokens/${tokenId}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "400": decodeError("TokensDelete400", TokensDelete400),
            "401": decodeError("TokensDelete401", TokensDelete401),
            "403": decodeError("TokensDelete403", TokensDelete403),
            "204": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsListByProfile: (handle, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsListByProfile200),
            "400": decodeError("ExtensionsListByProfile400", ExtensionsListByProfile400),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsListByType: (handle, type, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/${type}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsListByType200),
            "400": decodeError("ExtensionsListByType400", ExtensionsListByType400),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsGet: (handle, type, name, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/${type}/${name}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsGet200),
            "400": decodeError("ExtensionsGet400", ExtensionsGet400),
            "404": decodeError("ExtensionsGet404", ExtensionsGet404),
            "304": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsHead: (handle, type, name, options) =>
      HttpClientRequest.head(`/v1/extensions/${handle}/${type}/${name}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "200": () => Effect.void,
            "400": decodeVoidError("400"),
            "404": decodeVoidError("404"),
            "500": decodeVoidError("500"),
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
            "400": decodeError("ExtensionsUpdateVisibility400", ExtensionsUpdateVisibility400),
            "401": decodeError("ExtensionsUpdateVisibility401", ExtensionsUpdateVisibility401),
            "403": decodeError("ExtensionsUpdateVisibility403", ExtensionsUpdateVisibility403),
            "404": decodeError("ExtensionsUpdateVisibility404", ExtensionsUpdateVisibility404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsGetVersion: (handle, type, name, version, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/${type}/${name}/${version}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsGetVersion200),
            "400": decodeError("ExtensionsGetVersion400", ExtensionsGetVersion400),
            "404": decodeError("ExtensionsGetVersion404", ExtensionsGetVersion404),
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
            "400": decodeError("ExtensionsPublishVersion400", ExtensionsPublishVersion400),
            "401": decodeError("ExtensionsPublishVersion401", ExtensionsPublishVersion401),
            "403": decodeError("ExtensionsPublishVersion403", ExtensionsPublishVersion403),
            "404": decodeError("ExtensionsPublishVersion404", ExtensionsPublishVersion404),
            "409": decodeError("ExtensionsPublishVersion409", ExtensionsPublishVersion409),
            "413": decodeError("ExtensionsPublishVersion413", ExtensionsPublishVersion413),
            "415": decodeError("ExtensionsPublishVersion415", ExtensionsPublishVersion415),
            "422": decodeError("ExtensionsPublishVersion422", ExtensionsPublishVersion422),
            "429": decodeError("ExtensionsPublishVersion429", ExtensionsPublishVersion429),
            "500": decodeError("ExtensionsPublishVersion500", ExtensionsPublishVersion500),
            "501": decodeError("ExtensionsPublishVersion501", ExtensionsPublishVersion501),
            "503": decodeError("ExtensionsPublishVersion503", ExtensionsPublishVersion503),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsDeleteVersion: (handle, type, name, version, options) =>
      HttpClientRequest.delete(`/v1/extensions/${handle}/${type}/${name}/${version}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "400": decodeError("ExtensionsDeleteVersion400", ExtensionsDeleteVersion400),
            "401": decodeError("ExtensionsDeleteVersion401", ExtensionsDeleteVersion401),
            "403": decodeError("ExtensionsDeleteVersion403", ExtensionsDeleteVersion403),
            "404": decodeError("ExtensionsDeleteVersion404", ExtensionsDeleteVersion404),
            "204": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsDownloadArchive: (handle, type, name, version, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/${type}/${name}/${version}/archive`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeBinary,
            "400": decodeError("ExtensionsDownloadArchive400", ExtensionsDownloadArchive400),
            "404": decodeError("ExtensionsDownloadArchive404", ExtensionsDownloadArchive404),
            "500": decodeError("ExtensionsDownloadArchive500", ExtensionsDownloadArchive500),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsDownloadArchiveStream: (handle, type, name, version) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/${type}/${name}/${version}/archive`).pipe(
        binaryRequest,
      ),
    ExtensionsGetHandleProfile: (handle, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/owner`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsGetHandleProfile200),
            "400": decodeError("ExtensionsGetHandleProfile400", ExtensionsGetHandleProfile400),
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
            "400": decodeError("ExtensionsDeprecate400", ExtensionsDeprecate400),
            "401": decodeError("ExtensionsDeprecate401", ExtensionsDeprecate401),
            "403": decodeError("ExtensionsDeprecate403", ExtensionsDeprecate403),
            "404": decodeError("ExtensionsDeprecate404", ExtensionsDeprecate404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsUndeprecate: (handle, type, name, options) =>
      HttpClientRequest.delete(`/v1/extensions/${handle}/${type}/${name}/deprecate`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsUndeprecate200),
            "400": decodeError("ExtensionsUndeprecate400", ExtensionsUndeprecate400),
            "401": decodeError("ExtensionsUndeprecate401", ExtensionsUndeprecate401),
            "403": decodeError("ExtensionsUndeprecate403", ExtensionsUndeprecate403),
            "404": decodeError("ExtensionsUndeprecate404", ExtensionsUndeprecate404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsYankVersion: (handle, type, name, version, options) =>
      HttpClientRequest.post(`/v1/extensions/${handle}/${type}/${name}/${version}/yank`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsYankVersion200),
            "400": decodeError("ExtensionsYankVersion400", ExtensionsYankVersion400),
            "401": decodeError("ExtensionsYankVersion401", ExtensionsYankVersion401),
            "403": decodeError("ExtensionsYankVersion403", ExtensionsYankVersion403),
            "404": decodeError("ExtensionsYankVersion404", ExtensionsYankVersion404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsUnyankVersion: (handle, type, name, version, options) =>
      HttpClientRequest.delete(`/v1/extensions/${handle}/${type}/${name}/${version}/yank`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsUnyankVersion200),
            "400": decodeError("ExtensionsUnyankVersion400", ExtensionsUnyankVersion400),
            "401": decodeError("ExtensionsUnyankVersion401", ExtensionsUnyankVersion401),
            "403": decodeError("ExtensionsUnyankVersion403", ExtensionsUnyankVersion403),
            "404": decodeError("ExtensionsUnyankVersion404", ExtensionsUnyankVersion404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    CollaboratorsListCollaborators: (handle, type, name, options) =>
      HttpClientRequest.get(`/v1/extensions/${handle}/${type}/${name}/collaborators`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(CollaboratorsListCollaborators200),
            "400": decodeError(
              "CollaboratorsListCollaborators400",
              CollaboratorsListCollaborators400,
            ),
            "401": decodeError(
              "CollaboratorsListCollaborators401",
              CollaboratorsListCollaborators401,
            ),
            "403": decodeError(
              "CollaboratorsListCollaborators403",
              CollaboratorsListCollaborators403,
            ),
            "404": decodeError(
              "CollaboratorsListCollaborators404",
              CollaboratorsListCollaborators404,
            ),
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
            "400": decodeError(
              "CollaboratorsUpsertCollaborator400",
              CollaboratorsUpsertCollaborator400,
            ),
            "401": decodeError(
              "CollaboratorsUpsertCollaborator401",
              CollaboratorsUpsertCollaborator401,
            ),
            "403": decodeError(
              "CollaboratorsUpsertCollaborator403",
              CollaboratorsUpsertCollaborator403,
            ),
            "404": decodeError(
              "CollaboratorsUpsertCollaborator404",
              CollaboratorsUpsertCollaborator404,
            ),
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
            "400": decodeError(
              "CollaboratorsDeleteCollaborator400",
              CollaboratorsDeleteCollaborator400,
            ),
            "401": decodeError(
              "CollaboratorsDeleteCollaborator401",
              CollaboratorsDeleteCollaborator401,
            ),
            "403": decodeError(
              "CollaboratorsDeleteCollaborator403",
              CollaboratorsDeleteCollaborator403,
            ),
            "404": decodeError(
              "CollaboratorsDeleteCollaborator404",
              CollaboratorsDeleteCollaborator404,
            ),
            "409": decodeError(
              "CollaboratorsDeleteCollaborator409",
              CollaboratorsDeleteCollaborator409,
            ),
            "204": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    HealthGetShallowHealth: (options) =>
      HttpClientRequest.get(`/v1/health`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(HealthGetShallowHealth200),
            "400": decodeError("HealthGetShallowHealth400", HealthGetShallowHealth400),
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
            "400": decodeError("HealthGetDeepHealth400", HealthGetDeepHealth400),
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
            "400": decodeError(
              "HealthGetObservabilityVerification400",
              HealthGetObservabilityVerification400,
            ),
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
            "400": decodeError("SearchSearchExtensions400", SearchSearchExtensions400),
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"MetaGet400", typeof MetaGet400.Type>
  >;
  /**
   * Initiate OAuth device authorization flow
   */
  readonly AuthIssueDeviceCode: <Config extends OperationConfig>(options: {
    readonly payload: typeof AuthIssueDeviceCodeRequestFormUrlEncoded.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<typeof AuthIssueDeviceCode200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthIssueDeviceCode400", typeof AuthIssueDeviceCode400.Type>
  >;
  /**
   * Exchange device code for access token (RFC 8628 polling)
   */
  readonly AuthExchangeDeviceCode: <Config extends OperationConfig>(options: {
    readonly payload: typeof AuthExchangeDeviceCodeRequestFormUrlEncoded.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<typeof AuthExchangeDeviceCode200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthExchangeDeviceCode400", typeof AuthExchangeDeviceCode400.Type>
  >;
  /**
   * Exchange refresh token for new token pair
   */
  readonly AuthRefreshToken: <Config extends OperationConfig>(options: {
    readonly payload: typeof AuthRefreshTokenRequestFormUrlEncoded.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<typeof AuthRefreshToken200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthRefreshToken400", typeof AuthRefreshToken400.Type>
    | RegistryClientError<"AuthRefreshToken401", typeof AuthRefreshToken401.Type>
  >;
  /**
   * Revoke an authentication token
   */
  readonly AuthRevokeToken: <Config extends OperationConfig>(options: {
    readonly payload: typeof AuthRevokeTokenRequestFormUrlEncoded.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthRevokeToken400", typeof AuthRevokeToken400.Type>
  >;
  /**
   * Return authenticated user info
   */
  readonly AuthGetMe: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof AuthGetMe200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthGetMe400", typeof AuthGetMe400.Type>
    | RegistryClientError<"AuthGetMe401", typeof AuthGetMe401.Type>
  >;
  /**
   * Exchange OIDC token (reserved, not implemented)
   */
  readonly AuthExchangeOidcToken: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthExchangeOidcToken400", typeof AuthExchangeOidcToken400.Type>
    | RegistryClientError<"AuthExchangeOidcToken501", typeof AuthExchangeOidcToken501.Type>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"TokensList400", typeof TokensList400.Type>
    | RegistryClientError<"TokensList401", typeof TokensList401.Type>
    | RegistryClientError<"TokensList403", typeof TokensList403.Type>
  >;
  /**
   * Create scoped access token
   */
  readonly TokensCreate: <Config extends OperationConfig>(options: {
    readonly payload: typeof TokensCreateRequestJson.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<typeof TokensCreate201.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"TokensCreate400", typeof TokensCreate400.Type>
    | RegistryClientError<"TokensCreate401", typeof TokensCreate401.Type>
    | RegistryClientError<"TokensCreate403", typeof TokensCreate403.Type>
    | RegistryClientError<"TokensCreate422", typeof TokensCreate422.Type>
  >;
  /**
   * Revoke access token
   */
  readonly TokensDelete: <Config extends OperationConfig>(
    tokenId: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"TokensDelete400", typeof TokensDelete400.Type>
    | RegistryClientError<"TokensDelete401", typeof TokensDelete401.Type>
    | RegistryClientError<"TokensDelete403", typeof TokensDelete403.Type>
  >;
  /**
   * List owner extensions
   */
  readonly ExtensionsListByProfile: <Config extends OperationConfig>(
    handle: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsListByProfile200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsListByProfile400", typeof ExtensionsListByProfile400.Type>
  >;
  /**
   * List extensions by owner and type
   */
  readonly ExtensionsListByType: <Config extends OperationConfig>(
    handle: string,
    type: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsListByType200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsListByType400", typeof ExtensionsListByType400.Type>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsGet400", typeof ExtensionsGet400.Type>
    | RegistryClientError<"ExtensionsGet404", typeof ExtensionsGet404.Type>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"400", undefined>
    | RegistryClientError<"404", undefined>
    | RegistryClientError<"500", undefined>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<
        "ExtensionsUpdateVisibility400",
        typeof ExtensionsUpdateVisibility400.Type
      >
    | RegistryClientError<
        "ExtensionsUpdateVisibility401",
        typeof ExtensionsUpdateVisibility401.Type
      >
    | RegistryClientError<
        "ExtensionsUpdateVisibility403",
        typeof ExtensionsUpdateVisibility403.Type
      >
    | RegistryClientError<
        "ExtensionsUpdateVisibility404",
        typeof ExtensionsUpdateVisibility404.Type
      >
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsGetVersion400", typeof ExtensionsGetVersion400.Type>
    | RegistryClientError<"ExtensionsGetVersion404", typeof ExtensionsGetVersion404.Type>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsPublishVersion400", typeof ExtensionsPublishVersion400.Type>
    | RegistryClientError<"ExtensionsPublishVersion401", typeof ExtensionsPublishVersion401.Type>
    | RegistryClientError<"ExtensionsPublishVersion403", typeof ExtensionsPublishVersion403.Type>
    | RegistryClientError<"ExtensionsPublishVersion404", typeof ExtensionsPublishVersion404.Type>
    | RegistryClientError<"ExtensionsPublishVersion409", typeof ExtensionsPublishVersion409.Type>
    | RegistryClientError<"ExtensionsPublishVersion413", typeof ExtensionsPublishVersion413.Type>
    | RegistryClientError<"ExtensionsPublishVersion415", typeof ExtensionsPublishVersion415.Type>
    | RegistryClientError<"ExtensionsPublishVersion422", typeof ExtensionsPublishVersion422.Type>
    | RegistryClientError<"ExtensionsPublishVersion429", typeof ExtensionsPublishVersion429.Type>
    | RegistryClientError<"ExtensionsPublishVersion500", typeof ExtensionsPublishVersion500.Type>
    | RegistryClientError<"ExtensionsPublishVersion501", typeof ExtensionsPublishVersion501.Type>
    | RegistryClientError<"ExtensionsPublishVersion503", typeof ExtensionsPublishVersion503.Type>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsDeleteVersion400", typeof ExtensionsDeleteVersion400.Type>
    | RegistryClientError<"ExtensionsDeleteVersion401", typeof ExtensionsDeleteVersion401.Type>
    | RegistryClientError<"ExtensionsDeleteVersion403", typeof ExtensionsDeleteVersion403.Type>
    | RegistryClientError<"ExtensionsDeleteVersion404", typeof ExtensionsDeleteVersion404.Type>
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
    WithOptionalResponse<Uint8Array, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsDownloadArchive400", typeof ExtensionsDownloadArchive400.Type>
    | RegistryClientError<"ExtensionsDownloadArchive404", typeof ExtensionsDownloadArchive404.Type>
    | RegistryClientError<"ExtensionsDownloadArchive500", typeof ExtensionsDownloadArchive500.Type>
  >;
  /**
   * Download extension archive
   */
  readonly ExtensionsDownloadArchiveStream: (
    handle: string,
    type: string,
    name: string,
    version: string,
  ) => Stream.Stream<Uint8Array, HttpClientError.HttpClientError>;
  /**
   * Returns the current mock handle owner payload.
   */
  readonly ExtensionsGetHandleProfile: <Config extends OperationConfig>(
    handle: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsGetHandleProfile200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<
        "ExtensionsGetHandleProfile400",
        typeof ExtensionsGetHandleProfile400.Type
      >
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsDeprecate400", typeof ExtensionsDeprecate400.Type>
    | RegistryClientError<"ExtensionsDeprecate401", typeof ExtensionsDeprecate401.Type>
    | RegistryClientError<"ExtensionsDeprecate403", typeof ExtensionsDeprecate403.Type>
    | RegistryClientError<"ExtensionsDeprecate404", typeof ExtensionsDeprecate404.Type>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsUndeprecate400", typeof ExtensionsUndeprecate400.Type>
    | RegistryClientError<"ExtensionsUndeprecate401", typeof ExtensionsUndeprecate401.Type>
    | RegistryClientError<"ExtensionsUndeprecate403", typeof ExtensionsUndeprecate403.Type>
    | RegistryClientError<"ExtensionsUndeprecate404", typeof ExtensionsUndeprecate404.Type>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsYankVersion400", typeof ExtensionsYankVersion400.Type>
    | RegistryClientError<"ExtensionsYankVersion401", typeof ExtensionsYankVersion401.Type>
    | RegistryClientError<"ExtensionsYankVersion403", typeof ExtensionsYankVersion403.Type>
    | RegistryClientError<"ExtensionsYankVersion404", typeof ExtensionsYankVersion404.Type>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsUnyankVersion400", typeof ExtensionsUnyankVersion400.Type>
    | RegistryClientError<"ExtensionsUnyankVersion401", typeof ExtensionsUnyankVersion401.Type>
    | RegistryClientError<"ExtensionsUnyankVersion403", typeof ExtensionsUnyankVersion403.Type>
    | RegistryClientError<"ExtensionsUnyankVersion404", typeof ExtensionsUnyankVersion404.Type>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<
        "CollaboratorsListCollaborators400",
        typeof CollaboratorsListCollaborators400.Type
      >
    | RegistryClientError<
        "CollaboratorsListCollaborators401",
        typeof CollaboratorsListCollaborators401.Type
      >
    | RegistryClientError<
        "CollaboratorsListCollaborators403",
        typeof CollaboratorsListCollaborators403.Type
      >
    | RegistryClientError<
        "CollaboratorsListCollaborators404",
        typeof CollaboratorsListCollaborators404.Type
      >
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<
        "CollaboratorsUpsertCollaborator400",
        typeof CollaboratorsUpsertCollaborator400.Type
      >
    | RegistryClientError<
        "CollaboratorsUpsertCollaborator401",
        typeof CollaboratorsUpsertCollaborator401.Type
      >
    | RegistryClientError<
        "CollaboratorsUpsertCollaborator403",
        typeof CollaboratorsUpsertCollaborator403.Type
      >
    | RegistryClientError<
        "CollaboratorsUpsertCollaborator404",
        typeof CollaboratorsUpsertCollaborator404.Type
      >
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<
        "CollaboratorsDeleteCollaborator400",
        typeof CollaboratorsDeleteCollaborator400.Type
      >
    | RegistryClientError<
        "CollaboratorsDeleteCollaborator401",
        typeof CollaboratorsDeleteCollaborator401.Type
      >
    | RegistryClientError<
        "CollaboratorsDeleteCollaborator403",
        typeof CollaboratorsDeleteCollaborator403.Type
      >
    | RegistryClientError<
        "CollaboratorsDeleteCollaborator404",
        typeof CollaboratorsDeleteCollaborator404.Type
      >
    | RegistryClientError<
        "CollaboratorsDeleteCollaborator409",
        typeof CollaboratorsDeleteCollaborator409.Type
      >
  >;
  /**
   * Returns pass/fail status. Public, no auth required.
   */
  readonly HealthGetShallowHealth: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof HealthGetShallowHealth200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"HealthGetShallowHealth400", typeof HealthGetShallowHealth400.Type>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"HealthGetDeepHealth400", typeof HealthGetDeepHealth400.Type>
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
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<
        "HealthGetObservabilityVerification400",
        typeof HealthGetObservabilityVerification400.Type
      >
  >;
  /**
   * Returns the current mock search response for the provided query string.
   */
  readonly SearchSearchExtensions: <Config extends OperationConfig>(options: {
    readonly params: typeof SearchSearchExtensionsParams.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<typeof SearchSearchExtensions200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"SearchSearchExtensions400", typeof SearchSearchExtensions400.Type>
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
