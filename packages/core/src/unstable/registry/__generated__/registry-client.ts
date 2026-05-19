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
export type MetaResponse = {
  readonly ok: true;
  readonly service: "registry";
  readonly message: string;
  readonly docs: string | null;
  readonly openapi: string | null;
};
export const MetaResponse = Schema.Struct({
  ok: Schema.Literal(true),
  service: Schema.Literal("registry"),
  message: Schema.String.annotate({ description: "Human-readable service greeting." }),
  docs: Schema.Union([
    Schema.String.annotate({
      description: "Path to the interactive API documentation, or null when docs are disabled.",
      format: "uri-reference",
    }),
    Schema.Null,
  ]),
  openapi: Schema.Union([
    Schema.String.annotate({
      description: "Path to the OpenAPI specification, or null when docs are disabled.",
      format: "uri-reference",
    }),
    Schema.Null,
  ]),
}).annotate({
  title: "Meta Response",
  description: "Registry service metadata including health status and documentation entry points.",
});
export type DecodeErrorResponse = {
  readonly kind: "DecodeErrorResponse";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: string;
};
export const DecodeErrorResponse = Schema.Struct({
  kind: Schema.Literal("DecodeErrorResponse"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  code: Schema.String,
});
export type DeviceCodeResponse = {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri: string;
  readonly verification_uri_complete: string;
  readonly expires_in: number;
  readonly interval: number;
};
export const DeviceCodeResponse = Schema.Struct({
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
export type PublishDetails = {
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly requiredScope?: string;
  readonly tokenScopes?: ReadonlyArray<string>;
  readonly requiredRole?: string | null;
};
export const PublishDetails = Schema.Struct({
  retryable: Schema.Boolean.annotate({ description: "Whether the client may retry the request." }),
  retryAfterSeconds: Schema.optionalKey(
    Schema.Number.annotate({ description: "Suggested delay in seconds before retrying." }).check(
      Schema.isFinite(),
    ),
  ),
  requiredScope: Schema.optionalKey(
    Schema.String.annotate({
      description: "The scope required to perform the operation, if applicable.",
    }),
  ),
  tokenScopes: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: "The scopes present on the token used for the request.",
    }),
  ),
  requiredRole: Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Null]).annotate({
      description: "The collaborator role required, if applicable.",
    }),
  ),
}).annotate({
  title: "Publish Details",
  description: "Extended error details for publish-related and retryable error responses.",
});
export type SessionTokenResponse = {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: "Bearer";
  readonly expires_in: number;
  readonly expires_at: string;
  readonly scope?: string | null;
};
export const SessionTokenResponse = Schema.Struct({
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
export type TokenOAuthError = {
  readonly kind: "TokenOAuthError";
  readonly error:
    | "invalid_request"
    | "invalid_client"
    | "invalid_grant"
    | "unauthorized_client"
    | "unsupported_grant_type"
    | "invalid_scope"
    | "authorization_pending"
    | "slow_down"
    | "expired_token"
    | "access_denied";
  readonly error_description: string;
};
export const TokenOAuthError = Schema.Struct({
  kind: Schema.Literal("TokenOAuthError"),
  error: Schema.Literals([
    "invalid_request",
    "invalid_client",
    "invalid_grant",
    "unauthorized_client",
    "unsupported_grant_type",
    "invalid_scope",
    "authorization_pending",
    "slow_down",
    "expired_token",
    "access_denied",
  ]).annotate({ title: "OAuth Token Error", description: "OAuth token endpoint error code." }),
  error_description: Schema.String.annotate({
    description: "Human-readable explanation of the error.",
  }),
});
export type AuthWhoamiResponse = { readonly handle: string };
export const AuthWhoamiResponse = Schema.Struct({
  handle: Schema.String.annotate({
    description: "The authenticated user's registry handle.",
    examples: ["@example"],
  }),
}).annotate({
  title: "Auth Whoami Response",
  description: "Minimal identity response for login checks and CLI whoami.",
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
export type ResourceRestrictions = { readonly extensions: ReadonlyArray<string> | null };
export const ResourceRestrictions = Schema.Struct({
  extensions: Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
    description: "Extension patterns this token is limited to, or null if unrestricted.",
  }),
}).annotate({
  title: "Resource Restrictions",
  description: "What this token is allowed to access.",
});
export type StepUpChallengeResponse =
  | { readonly status: "pending" }
  | { readonly status: "completed"; readonly step_up: string; readonly expires_at: string };
export const StepUpChallengeResponse = Schema.Union([
  Schema.Struct({ status: Schema.Literal("pending") }),
  Schema.Struct({
    status: Schema.Literal("completed"),
    step_up: Schema.String.annotate({
      description: "Opaque step-up proof for the original request.",
    }),
    expires_at: Schema.String.annotate({ description: "ISO timestamp when this proof expires." }),
  }),
]).annotate({ title: "Step-up Challenge Response" });
export type TokenId = string;
export const TokenId = Schema.String.check(
  Schema.isPattern(new RegExp("^tok_[0-7][0-9a-hjkmnp-tv-z]{25}$"), {
    title: "Token ID",
    description:
      "Identifies an access token or personal access token (PAT) issued to a user. Used to authenticate API requests to the registry.",
    examples: ["tok_01h455vb4pexka56gq5w2r7cpc"],
  }),
);
export type IsoDateTimeString = string;
export const IsoDateTimeString = Schema.String.check(Schema.isMinLength(1));
export type ScopeCheckDetails = {
  readonly requiredScope: string;
  readonly grantedScopes: ReadonlyArray<string>;
};
export const ScopeCheckDetails = Schema.Struct({
  requiredScope: Schema.String.annotate({
    description: "The scope required to perform the requested operation.",
  }),
  grantedScopes: Schema.Array(Schema.String).annotate({
    description: "The scopes granted to the current credential.",
  }),
}).annotate({
  title: "Scope Check Details",
  description: "Diagnostic details returned when a request is denied due to insufficient scopes.",
});
export type AuthorizationDenyDetails = {
  readonly requiredScope: string;
  readonly tokenScopes: ReadonlyArray<string>;
  readonly requiredRole?: string;
};
export const AuthorizationDenyDetails = Schema.Struct({
  requiredScope: Schema.String.annotate({
    description: "The scope required to perform the requested operation.",
  }),
  tokenScopes: Schema.Array(Schema.String).annotate({
    description: "The scopes present on the token used for the request.",
  }),
  requiredRole: Schema.optionalKey(
    Schema.String.annotate({ description: "The collaborator role required, if applicable." }),
  ),
}).annotate({
  title: "Authorization Deny Details",
  description:
    "Diagnostic details returned when a request is denied due to insufficient authorization.",
});
export type CreateTokenPermissionsRequest = {
  readonly owners?: ReadonlyArray<string> | null;
  readonly extensions?: ReadonlyArray<string> | null;
  readonly permission?: "read" | "publish" | "admin" | null;
  readonly org_permission?: "read" | "write" | "admin" | null;
  readonly cidr?: ReadonlyArray<string> | null;
  readonly bypass_mfa?: boolean | null;
};
export const CreateTokenPermissionsRequest = Schema.Struct({
  owners: Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      description: 'Owner selectors for extension permissions. Use full handles or "all".',
      examples: [["@example"]],
    }),
  ),
  extensions: Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      description: "Extension selectors in @handle/<plural-type>/<name> form.",
      examples: [["@example/skills/release-bot"]],
    }),
  ),
  permission: Schema.optionalKey(
    Schema.Union([Schema.Literals(["read", "publish", "admin"]), Schema.Null]).annotate({
      description: "Extension-level permission to grant.",
    }),
  ),
  org_permission: Schema.optionalKey(
    Schema.Union([Schema.Literals(["read", "write", "admin"]), Schema.Null]).annotate({
      description: "Organization-level permission to grant.",
    }),
  ),
  cidr: Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String), Schema.Null]).annotate({
      description: "Optional CIDR allowlist for the token.",
    }),
  ),
  bypass_mfa: Schema.optionalKey(
    Schema.Union([Schema.Boolean, Schema.Null]).annotate({
      description: "Whether this automation token bypasses step-up MFA.",
    }),
  ),
}).annotate({
  title: "Create Token Permissions Request",
  description: "Structured permission request for a granular access token.",
});
export type StepUpRequiredError = {
  readonly kind: "StepUpRequiredError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: "eotp";
  readonly authUrl: string;
  readonly doneUrl: string;
};
export const StepUpRequiredError = Schema.Struct({
  kind: Schema.Literal("StepUpRequiredError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  code: Schema.Literal("eotp"),
  authUrl: Schema.String,
  doneUrl: Schema.String,
});
export type Handle = string;
export const Handle = Schema.String.check(
  Schema.isPattern(new RegExp("^@[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$"), {
    title: "Handle",
    description: "A unique username or organization name starting with @, like @my-org.",
    examples: ["@my-org", "@username"],
  }),
);
export type OwnerResponse = { readonly displayName: string };
export const OwnerResponse = Schema.Struct({
  displayName: Schema.String.annotate({ description: "Display name for the owner account." }),
}).annotate({ title: "Owner Response", description: "Minimal owner summary for machine clients." });
export type CreateTeamBody = {
  readonly displayName: string;
  readonly description?: string | null | null;
};
export const CreateTeamBody = Schema.Struct({
  displayName: Schema.String.annotate({ description: "Display name for the team." }),
  description: Schema.optionalKey(
    Schema.Union([
      Schema.Union([Schema.String, Schema.Null]).annotate({
        description: "Optional description for the team.",
      }),
      Schema.Null,
    ]),
  ),
}).annotate({
  title: "Create Team Body",
  description: "Request body for creating a new team under an organization.",
});
export type TeamId = string;
export const TeamId = Schema.String.check(
  Schema.isPattern(new RegExp("^team_[0-7][0-9a-hjkmnp-tv-z]{25}$"), {
    title: "Team ID",
    description:
      "Identifies a team within an organization. Teams group members and receive extension grants that widen access beyond a private extension's owning org.",
    examples: ["team_01h455vb4pexka56gq5w2r7cpc"],
  }),
);
export type OrgId = string;
export const OrgId = Schema.String.check(
  Schema.isPattern(new RegExp("^org_[0-7][0-9a-hjkmnp-tv-z]{25}$"), {
    title: "Organization ID",
    description:
      "Identifies an organization. Organizations own handles and govern team membership and extension publishing permissions.",
    examples: ["org_01h455vb4pexka56gq5w2r7cpc"],
  }),
);
export type UserIdRef = string;
export const UserIdRef = Schema.String.check(
  Schema.isPattern(new RegExp("^user_[0-7][0-9a-hjkmnp-tv-z]{25}$"), {
    title: "User ID",
    description:
      "Identifies a registered user account. Assigned at sign-up and referenced by tokens, memberships, and audit trails.",
    examples: ["user_01h455vb4pexka56gq5w2r7cpc"],
    readOnly: true,
  }),
);
export type UpdateTeamBody = {
  readonly displayName?: string | null;
  readonly description?: string | null | null;
};
export const UpdateTeamBody = Schema.Struct({
  displayName: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({ description: "New display name for the team." }),
      Schema.Null,
    ]),
  ),
  description: Schema.optionalKey(
    Schema.Union([
      Schema.Union([Schema.String, Schema.Null]).annotate({
        description: "New description for the team (null to clear).",
      }),
      Schema.Null,
    ]),
  ),
}).annotate({
  title: "Update Team Body",
  description:
    "Partial update body for a team. At least one of displayName or description must be provided.",
});
export type ChangeTeamMemberRoleBody = { readonly role: "admin" | "member" };
export const ChangeTeamMemberRoleBody = Schema.Struct({
  role: Schema.Literals(["admin", "member"]).annotate({
    title: "Team Role",
    description:
      "Role within a team — 'admin' manages membership and grants; 'member' inherits grants.",
  }),
}).annotate({ title: "Change Team Member Role Body" });
export type ListId = string;
export const ListId = Schema.String.check(
  Schema.isPattern(new RegExp("^list_[0-7][0-9a-hjkmnp-tv-z]{25}$"), {
    title: "List ID",
    description: "Identifies a handle-scoped curated extension collection in the registry.",
    examples: ["list_01h455vb4pexka56gq5w2r7cpc"],
  }),
);
export type ListVisibility = "public" | "internal" | "private";
export const ListVisibility = Schema.Literals(["public", "internal", "private"]).annotate({
  title: "List Visibility",
});
export type ListItemId = string;
export const ListItemId = Schema.String.check(
  Schema.isPattern(new RegExp("^litem_[0-7][0-9a-hjkmnp-tv-z]{25}$"), {
    title: "List Item ID",
    description: "Identifies an ordered extension membership inside a curated registry list.",
    examples: ["litem_01h455vb4pexka56gq5w2r7cpc"],
  }),
);
export type ExtensionType =
  | "skill"
  | "command"
  | "mcp-server"
  | "subagent"
  | "file"
  | "rule"
  | "pack";
export const ExtensionType = Schema.Literals([
  "skill",
  "command",
  "mcp-server",
  "subagent",
  "file",
  "rule",
  "pack",
]).annotate({
  title: "Extension Type",
  description:
    "What kind of extension this is: skill, command, mcp-server, subagent, file, rule, or pack.",
});
export type ExtensionName = string;
export const ExtensionName = Schema.String.check(Schema.isMinLength(1)).check(
  Schema.isPattern(new RegExp("^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$"), {
    title: "Extension Name",
    description:
      "The name of an extension — lowercase letters, numbers, and hyphens (e.g. my-skill).",
    examples: ["my-skill", "code-review", "prettier"],
  }),
);
export type Version = string;
export const Version = Schema.String.check(
  Schema.isPattern(
    new RegExp(
      "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$",
    ),
    {
      title: "Version",
      description: "A semver version like 1.0.0. Ranges are not allowed here.",
      examples: ["1.0.0", "2.3.1", "0.1.0-beta.1"],
    },
  ),
);
export type Repository = {
  readonly url: string;
  readonly type?: string | null;
  readonly directory?: string | null;
};
export const Repository = Schema.Struct({
  url: Schema.String.annotate({
    description: "Canonical repository URL for the extension source.",
    format: "uri",
  }),
  type: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({ description: "Repository type from the manifest, such as git." }),
      Schema.Null,
    ]),
  ),
  directory: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({ description: "Subdirectory containing the extension source." }),
      Schema.Null,
    ]),
  ),
}).annotate({ title: "Repository", description: "Repository details for an extension manifest." });
export type LicenseExpression = string;
export const LicenseExpression = Schema.String.annotate({
  title: "License Expression",
  description: "SPDX license expression, or `UNLICENSED` for proprietary code.",
  examples: ["MIT", "Apache-2.0", "MIT OR Apache-2.0", "UNLICENSED"],
  format: "spdx-expression",
});
export type Author = {
  readonly name?: string | null;
  readonly email?: string | null;
  readonly url?: string | null;
};
export const Author = Schema.Struct({
  name: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({ description: "Display name of the extension author." }),
      Schema.Null,
    ]),
  ),
  email: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Contact email of the extension author.",
        format: "email",
      }),
      Schema.Null,
    ]),
  ),
  url: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "URL for the extension author (homepage or profile).",
        format: "uri",
      }),
      Schema.Null,
    ]),
  ),
}).annotate({ title: "Author", description: "Author details: name, email, and homepage URL." });
export type Bugs = { readonly url?: string | null; readonly email?: string | null };
export const Bugs = Schema.Struct({
  url: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Issue tracker URL for the extension.",
        format: "uri",
      }),
      Schema.Null,
    ]),
  ),
  email: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Contact email for reporting extension issues.",
        format: "email",
      }),
      Schema.Null,
    ]),
  ),
}).annotate({ title: "Bugs", description: "Bug reporting details for an extension manifest." });
export type VersionRange = string;
export const VersionRange = Schema.String.check(Schema.isMinLength(1)).check(
  Schema.isPattern(new RegExp("^[~^<>=*xXvV0-9A-Za-z| .-]+$"), {
    title: "Version Range",
    description:
      'A semver version range like ^1.0.0, ~2.3.0, >=1.0.0 <3.0.0, or an exact version 1.2.3. Use "*" to always resolve to the latest available version.',
    examples: ["^1.0.0", "~2.4", ">=1 <3", "1.2.3", "*"],
  }),
);
export type PackageIdentityPurl = string;
export const PackageIdentityPurl = Schema.String.check(Schema.isMinLength(1)).check(
  Schema.isPattern(new RegExp("^[Pp][Kk][Gg]:[a-zA-Z][a-zA-Z0-9.+-]*\\/.+$"), {
    title: "Package Identity Purl",
    description:
      "A Package URL (purl) identity for a companion package. Companion package purls are identities, not pins: omit the purl @version segment and put compatibility constraints in versionRange.",
    examples: ["pkg:npm/react", "pkg:pypi/requests", "pkg:cargo/serde"],
  }),
);
export type PatchVisibilityBody = {
  readonly visibility?: "public" | "internal" | "private" | null;
  readonly listed?: boolean | null;
};
export const PatchVisibilityBody = Schema.Struct({
  visibility: Schema.optionalKey(
    Schema.Union([
      Schema.Literals(["public", "internal", "private"]).annotate({
        title: "Visibility",
        description: "Target visibility tier for the extension.",
      }),
      Schema.Null,
    ]),
  ),
  listed: Schema.optionalKey(
    Schema.Union([
      Schema.Boolean.annotate({
        title: "Listed",
        description:
          "Whether the extension appears on discovery surfaces (search, browse). Independent of visibility.",
      }),
      Schema.Null,
    ]),
  ),
}).annotate({
  title: "Patch Visibility Body",
  description:
    "Request body for updating an extension's visibility and/or listed flag. At least one field is required.",
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
export type ExtensionLinks = { readonly html: string };
export const ExtensionLinks = Schema.Struct({
  html: Schema.String.annotate({ format: "uri" }),
}).annotate({
  title: "Extension Links",
  description: "Hyperlinks for an extension resource. `html` is the canonical web page URL.",
});
export type DeprecateBody = { readonly notice?: string | null };
export const DeprecateBody = Schema.Struct({
  notice: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Message shown to users explaining why this extension is deprecated.",
        examples: ["Use @example/skills/new-skill instead."],
      }),
      Schema.Null,
    ]),
  ),
}).annotate({ title: "Deprecate Body", description: "Request body for deprecating an extension." });
export type PublishFindingLocation = {
  readonly file: string;
  readonly line?: number | "NaN" | "Infinity" | "-Infinity" | "Infinity" | "-Infinity" | "NaN";
  readonly column?: number | "NaN" | "Infinity" | "-Infinity" | "Infinity" | "-Infinity" | "NaN";
  readonly byteOffset?:
    | number
    | "NaN"
    | "Infinity"
    | "-Infinity"
    | "Infinity"
    | "-Infinity"
    | "NaN";
  readonly byteLength?:
    | number
    | "NaN"
    | "Infinity"
    | "-Infinity"
    | "Infinity"
    | "-Infinity"
    | "NaN";
};
export const PublishFindingLocation = Schema.Struct({
  file: Schema.String,
  line: Schema.optionalKey(
    Schema.Union([
      Schema.Union([
        Schema.Number.check(Schema.isFinite()),
        Schema.Literal("NaN"),
        Schema.Literal("Infinity"),
        Schema.Literal("-Infinity"),
      ]),
      Schema.Literals(["Infinity", "-Infinity", "NaN"]),
    ]),
  ),
  column: Schema.optionalKey(
    Schema.Union([
      Schema.Union([
        Schema.Number.check(Schema.isFinite()),
        Schema.Literal("NaN"),
        Schema.Literal("Infinity"),
        Schema.Literal("-Infinity"),
      ]),
      Schema.Literals(["Infinity", "-Infinity", "NaN"]),
    ]),
  ),
  byteOffset: Schema.optionalKey(
    Schema.Union([
      Schema.Union([
        Schema.Number.check(Schema.isFinite()),
        Schema.Literal("NaN"),
        Schema.Literal("Infinity"),
        Schema.Literal("-Infinity"),
      ]),
      Schema.Literals(["Infinity", "-Infinity", "NaN"]),
    ]),
  ),
  byteLength: Schema.optionalKey(
    Schema.Union([
      Schema.Union([
        Schema.Number.check(Schema.isFinite()),
        Schema.Literal("NaN"),
        Schema.Literal("Infinity"),
        Schema.Literal("-Infinity"),
      ]),
      Schema.Literals(["Infinity", "-Infinity", "NaN"]),
    ]),
  ),
}).annotate({
  title: "Finding Location",
  description: "Accessor-relative location of a lint finding.",
});
export type PublishIdentityMismatchEntry = {
  readonly field: "owner" | "type" | "name" | "version";
  readonly urlPath: string | null;
  readonly content: string | null;
};
export const PublishIdentityMismatchEntry = Schema.Struct({
  field: Schema.Literals(["owner", "type", "name", "version"]),
  urlPath: Schema.Union([Schema.String, Schema.Null]),
  content: Schema.Union([Schema.String, Schema.Null]),
}).annotate({
  title: "Identity Mismatch Entry",
  description: "Single divergent identity field between URL-path and archive.",
});
export type PutCollaboratorBody = { readonly role: "admin" | "write" | "read" };
export const PutCollaboratorBody = Schema.Struct({
  role: Schema.Literals(["admin", "write", "read"]).annotate({
    title: "Collaborator Role",
    description: "The role to assign to the collaborator.",
  }),
}).annotate({
  title: "Put Collaborator Body",
  description: "Request body for assigning a collaborator role on an extension.",
});
export type ExtensionFqn = string;
export const ExtensionFqn = Schema.String.check(
  Schema.isPattern(
    new RegExp(
      "^(@[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?)\\/(skills|commands|mcp-servers|subagents|files|rules|packs)\\/([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)$",
    ),
    {
      title: "Extension FQN",
      description: "Canonical extension identifier in @owner/<type>s/<name> form.",
      examples: ["@acme/skills/code-review", "@my-org/commands/format"],
    },
  ),
);
export type ProblemDetails = {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: string;
  readonly details?: PublishDetails;
};
export const ProblemDetails = Schema.Struct({
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  code: Schema.String,
  details: Schema.optionalKey(PublishDetails),
}).annotate({
  title: "Problem Details",
  description: "RFC 9457 Problem Details payload for AgentXM Registry errors.",
});
export type AuthMeUser = {
  readonly id: UserId;
  readonly handle: string;
  readonly email: string | null;
};
export const AuthMeUser = Schema.Struct({
  id: UserId,
  handle: Schema.String.annotate({
    description: "The user's registry handle.",
    examples: ["@example"],
  }),
  email: Schema.Union([
    Schema.String.annotate({
      description: "The user's email address, if available.",
      format: "email",
    }),
    Schema.Null,
  ]),
}).annotate({ title: "Authenticated User", description: "Your profile information." });
export type AddTeamMemberBody = { readonly userId: UserId; readonly role: "admin" | "member" };
export const AddTeamMemberBody = Schema.Struct({
  userId: UserId,
  role: Schema.Literals(["admin", "member"]).annotate({
    title: "Team Role",
    description:
      "Role within a team — 'admin' manages membership and grants; 'member' inherits grants.",
  }),
}).annotate({
  title: "Add Team Member Body",
  description: "Request body identifying the user to add to the team and the role to grant.",
});
export type AuthMeToken = {
  readonly id: string;
  readonly type: "session" | "pat" | "oidc";
  readonly name: string | null;
  readonly permissions: unknown | null;
  readonly scopes: ReadonlyArray<string>;
  readonly resource_restrictions: ResourceRestrictions;
  readonly expires_at: string;
};
export const AuthMeToken = Schema.Struct({
  id: Schema.String.annotate({
    description: "Opaque identifier of the credential used for this request.",
  }),
  type: Schema.Literals(["session", "pat", "oidc"]).annotate({
    title: "Token Type",
    description: "The type of authentication token.",
  }),
  name: Schema.Union([
    Schema.String.annotate({ description: "Human-readable name of the token, if assigned." }),
    Schema.Null,
  ]),
  permissions: Schema.Union([Schema.Unknown, Schema.Null]).annotate({
    description: "Structured permissions associated with this token.",
  }),
  scopes: Schema.Array(Schema.String).annotate({ description: "Scopes granted to this token." }),
  resource_restrictions: ResourceRestrictions,
  expires_at: Schema.String.annotate({
    description: "When this token expires.",
    format: "date-time",
  }),
}).annotate({
  title: "Token Info",
  description: "Details about the token you used to authenticate.",
});
export type TokenListItem = {
  readonly id: TokenId;
  readonly name: string | null;
  readonly type: string;
  readonly scopes: ReadonlyArray<string>;
  readonly permissions: unknown | null;
  readonly created_at: IsoDateTimeString;
  readonly expires_at: IsoDateTimeString;
  readonly last_used_at: IsoDateTimeString | null;
};
export const TokenListItem = Schema.Struct({
  id: TokenId,
  name: Schema.Union([
    Schema.String.annotate({ description: "Human-readable name of the token, if assigned." }),
    Schema.Null,
  ]),
  type: Schema.String.annotate({ description: "Token type (e.g. 'pat', 'session')." }),
  scopes: Schema.Array(Schema.String).annotate({ description: "Scopes granted to this token." }),
  permissions: Schema.Union([Schema.Unknown, Schema.Null]).annotate({
    description: "Structured permissions associated with this token.",
  }),
  created_at: IsoDateTimeString,
  expires_at: IsoDateTimeString,
  last_used_at: Schema.Union([IsoDateTimeString, Schema.Null]),
}).annotate({ title: "Token List Item", description: "Summary of an access token." });
export type CreateTokenResponse = {
  readonly id: TokenId;
  readonly token: string;
  readonly name: string;
  readonly scopes: ReadonlyArray<string>;
  readonly permissions: unknown;
  readonly created_at: IsoDateTimeString;
  readonly expires_at: IsoDateTimeString;
};
export const CreateTokenResponse = Schema.Struct({
  id: TokenId,
  token: Schema.String.annotate({
    description: "The token value — save this, it won't be shown again.",
    readOnly: true,
  }),
  name: Schema.String,
  scopes: Schema.Array(Schema.String),
  permissions: Schema.Unknown,
  created_at: IsoDateTimeString,
  expires_at: IsoDateTimeString,
}).annotate({
  title: "Create Token Response",
  description: "Your new access token. The token value is only shown once — save it now.",
});
export type ForbiddenError = {
  readonly kind: "ForbiddenError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code:
    | "forbidden"
    | "insufficient_scope"
    | "resource_restriction"
    | "scope_escalation"
    | "gat_requires_session"
    | "team_create_not_authorized"
    | "team_delete_not_authorized"
    | "team_update_not_authorized"
    | "add_team_member_not_authorized"
    | "remove_team_member_not_authorized"
    | "change_team_member_role_not_authorized"
    | "team_extension_grant_delete_not_authorized"
    | "team_extension_grant_not_authorized"
    | "publish/quota-exceeded"
    | "publish/insufficient-scope"
    | "publish/resource-restriction"
    | "publish/handle-not-owned"
    | "publish/publish-forbidden";
  readonly details?: ScopeCheckDetails | AuthorizationDenyDetails | PublishDetails;
};
export const ForbiddenError = Schema.Struct({
  kind: Schema.Literal("ForbiddenError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  code: Schema.Literals([
    "forbidden",
    "insufficient_scope",
    "resource_restriction",
    "scope_escalation",
    "gat_requires_session",
    "team_create_not_authorized",
    "team_delete_not_authorized",
    "team_update_not_authorized",
    "add_team_member_not_authorized",
    "remove_team_member_not_authorized",
    "change_team_member_role_not_authorized",
    "team_extension_grant_delete_not_authorized",
    "team_extension_grant_not_authorized",
    "publish/quota-exceeded",
    "publish/insufficient-scope",
    "publish/resource-restriction",
    "publish/handle-not-owned",
    "publish/publish-forbidden",
  ]),
  details: Schema.optionalKey(
    Schema.Union([ScopeCheckDetails, AuthorizationDenyDetails, PublishDetails]),
  ),
});
export type CreateTokenRequest = {
  readonly name: string;
  readonly scopes?: ReadonlyArray<string> | null;
  readonly permissions?: CreateTokenPermissionsRequest | null;
  readonly expires_in: number;
};
export const CreateTokenRequest = Schema.Struct({
  name: Schema.String.check(
    Schema.isMinLength(1, {
      description: "Human-readable name for the token.",
      examples: ["CI publish token"],
    }),
  ),
  scopes: Schema.optionalKey(
    Schema.Union([Schema.Array(Schema.String).check(Schema.isMinLength(1)), Schema.Null]).annotate({
      description: "Deprecated scope-string grant surface. Prefer permissions.",
      examples: [["extensions:read", "extensions:publish:version"]],
    }),
  ),
  permissions: Schema.optionalKey(
    Schema.Union([CreateTokenPermissionsRequest, Schema.Null]).annotate({
      description: "Structured permission request for the token.",
    }),
  ),
  expires_in: Schema.Number.check(Schema.isInt())
    .check(Schema.isFinite())
    .check(Schema.isGreaterThanOrEqualTo(3600))
    .check(
      Schema.isLessThanOrEqualTo(31536000, {
        description: "How long the token lasts, in seconds (1 hour to 365 days).",
      }),
    ),
}).annotate({
  title: "Create Token Request",
  description: "Request body for creating a new personal access token.",
});
export type UpsertTeamGrantBody = {
  readonly teamId: TeamId;
  readonly role: "read" | "write" | "admin";
};
export const UpsertTeamGrantBody = Schema.Struct({
  teamId: TeamId,
  role: Schema.Literals(["read", "write", "admin"]),
}).annotate({ title: "Upsert Team Grant Body" });
export type TeamGrant = {
  readonly teamId: TeamId;
  readonly role: "read" | "write" | "admin";
  readonly grantedBy: string;
  readonly grantedAt: string;
};
export const TeamGrant = Schema.Struct({
  teamId: TeamId,
  role: Schema.Literals(["read", "write", "admin"]),
  grantedBy: Schema.String,
  grantedAt: Schema.String.annotate({ readOnly: true, format: "date-time" }),
}).annotate({ title: "Team Grant" });
export type Team = {
  readonly id: TeamId;
  readonly organizationId: OrgId;
  readonly displayName: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly createdBy: UserIdRef;
  readonly updatedAt: string;
};
export const Team = Schema.Struct({
  id: TeamId,
  organizationId: OrgId,
  displayName: Schema.String,
  description: Schema.Union([Schema.String, Schema.Null]),
  createdAt: Schema.String.annotate({ readOnly: true, format: "date-time" }),
  createdBy: UserIdRef,
  updatedAt: Schema.String.annotate({ readOnly: true, format: "date-time" }),
}).annotate({ title: "Team" });
export type TeamMembership = {
  readonly teamId: TeamId;
  readonly userId: UserId;
  readonly role: "admin" | "member";
  readonly addedAt: string;
  readonly addedBy: UserIdRef;
};
export const TeamMembership = Schema.Struct({
  teamId: TeamId,
  userId: UserId,
  role: Schema.Literals(["admin", "member"]).annotate({
    title: "Team Role",
    description:
      "Role within a team — 'admin' manages membership and grants; 'member' inherits grants.",
  }),
  addedAt: Schema.String.annotate({ readOnly: true, format: "date-time" }),
  addedBy: UserIdRef,
}).annotate({ title: "Team Membership" });
export type List = {
  readonly id: ListId;
  readonly owner: Handle;
  readonly name: string;
  readonly title: string;
  readonly description: string | null;
  readonly visibility: ListVisibility;
  readonly listed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};
export const List = Schema.Struct({
  id: ListId,
  owner: Handle,
  name: Schema.String,
  title: Schema.String,
  description: Schema.Union([Schema.String, Schema.Null]),
  visibility: ListVisibility,
  listed: Schema.Boolean,
  createdAt: Schema.String.annotate({ readOnly: true, format: "date-time" }),
  updatedAt: Schema.String.annotate({ readOnly: true, format: "date-time" }),
}).annotate({ title: "List" });
export type CreateListBody = {
  readonly name: string;
  readonly title: string;
  readonly description?: string | null | null;
  readonly visibility?: ListVisibility | null;
  readonly listed?: boolean | null;
};
export const CreateListBody = Schema.Struct({
  name: Schema.String,
  title: Schema.String,
  description: Schema.optionalKey(
    Schema.Union([Schema.Union([Schema.String, Schema.Null]), Schema.Null]),
  ),
  visibility: Schema.optionalKey(Schema.Union([ListVisibility, Schema.Null])),
  listed: Schema.optionalKey(Schema.Union([Schema.Boolean, Schema.Null])),
}).annotate({ title: "Create List Body" });
export type UpdateListBody = {
  readonly name?: string | null;
  readonly title?: string | null;
  readonly description?: string | null | null;
  readonly visibility?: ListVisibility | null;
  readonly listed?: boolean | null;
};
export const UpdateListBody = Schema.Struct({
  name: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  title: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  description: Schema.optionalKey(
    Schema.Union([Schema.Union([Schema.String, Schema.Null]), Schema.Null]),
  ),
  visibility: Schema.optionalKey(Schema.Union([ListVisibility, Schema.Null])),
  listed: Schema.optionalKey(Schema.Union([Schema.Boolean, Schema.Null])),
}).annotate({ title: "Update List Body" });
export type ListItem = {
  readonly id: ListItemId;
  readonly extensionOwner: Handle;
  readonly extensionType: ExtensionType;
  readonly extensionName: ExtensionName;
  readonly position: number | "NaN" | "Infinity" | "-Infinity" | "Infinity" | "-Infinity" | "NaN";
  readonly note: string | null;
  readonly createdAt: string;
};
export const ListItem = Schema.Struct({
  id: ListItemId,
  extensionOwner: Handle,
  extensionType: ExtensionType,
  extensionName: ExtensionName,
  position: Schema.Union([
    Schema.Union([
      Schema.Number.check(Schema.isFinite()),
      Schema.Literal("NaN"),
      Schema.Literal("Infinity"),
      Schema.Literal("-Infinity"),
    ]),
    Schema.Literals(["Infinity", "-Infinity", "NaN"]),
  ]),
  note: Schema.Union([Schema.String, Schema.Null]),
  createdAt: Schema.String.annotate({ readOnly: true, format: "date-time" }),
}).annotate({ title: "List Item" });
export type AddListItemBody = {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly note?: string | null | null;
  readonly position?:
    | number
    | "NaN"
    | "Infinity"
    | "-Infinity"
    | "Infinity"
    | "-Infinity"
    | "NaN"
    | null;
};
export const AddListItemBody = Schema.Struct({
  owner: Handle,
  type: ExtensionType,
  name: ExtensionName,
  note: Schema.optionalKey(Schema.Union([Schema.Union([Schema.String, Schema.Null]), Schema.Null])),
  position: Schema.optionalKey(
    Schema.Union([
      Schema.Union([
        Schema.Union([
          Schema.Number.check(Schema.isFinite()),
          Schema.Literal("NaN"),
          Schema.Literal("Infinity"),
          Schema.Literal("-Infinity"),
        ]),
        Schema.Literals(["Infinity", "-Infinity", "NaN"]),
      ]),
      Schema.Null,
    ]),
  ),
}).annotate({ title: "Add List Item Body" });
export type PublishIdentity = {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
};
export const PublishIdentity = Schema.Struct({
  owner: Handle,
  type: ExtensionType,
  name: ExtensionName,
  version: Version,
}).annotate({
  title: "Publish Identity",
  description: "URL-path identity of the extension version under publish.",
});
export type SearchHit = {
  readonly name: ExtensionName;
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly latestVersion: Version;
  readonly description?: string | null;
  readonly repository?: Repository | null;
  readonly license?: LicenseExpression | null;
  readonly authors?: ReadonlyArray<Author> | null;
  readonly deprecated_at?: IsoDateTimeString | null;
  readonly deprecation_notice?: string | null;
};
export const SearchHit = Schema.Struct({
  name: ExtensionName,
  owner: Handle,
  type: ExtensionType,
  latestVersion: Version,
  description: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  repository: Schema.optionalKey(Schema.Union([Repository, Schema.Null])),
  license: Schema.optionalKey(Schema.Union([LicenseExpression, Schema.Null])),
  authors: Schema.optionalKey(Schema.Union([Schema.Array(Author), Schema.Null])),
  deprecated_at: Schema.optionalKey(Schema.Union([IsoDateTimeString, Schema.Null])),
  deprecation_notice: Schema.optionalKey(
    Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
  ),
}).annotate({ title: "Search Hit", description: "A single extension matched by a search query." });
export type CompanionPackage = {
  readonly purl: PackageIdentityPurl;
  readonly versionRange?: string | null;
};
export const CompanionPackage = Schema.Struct({
  purl: PackageIdentityPurl,
  versionRange: Schema.optionalKey(
    Schema.Union([
      Schema.String.check(
        Schema.isMinLength(1, {
          examples: ["vers:npm/>=18.0.0|<19.0.0", "vers:pypi/>=2.31.0", "vers:cargo/>=1.0.0"],
        }),
      ),
      Schema.Null,
    ]),
  ),
}).annotate({
  title: "Companion Package",
  description: "A companion package purl identity with an optional VERS compatibility range.",
});
export type PublishLintFinding = {
  readonly kind: "advisory" | "autofixable";
  readonly ruleId: string;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly location?: PublishFindingLocation;
  readonly path: string;
  readonly suggestions: ReadonlyArray<string>;
};
export const PublishLintFinding = Schema.Struct({
  kind: Schema.Literals(["advisory", "autofixable"]),
  ruleId: Schema.String,
  severity: Schema.Literals(["error", "warning", "info"]),
  message: Schema.String,
  location: Schema.optionalKey(PublishFindingLocation),
  path: Schema.String,
  suggestions: Schema.Array(Schema.String),
}).annotate({
  title: "Publish Lint Finding",
  description: "One lint finding produced against the publish subject.",
});
export type AuthMeResponse = {
  readonly user: AuthMeUser;
  readonly orgs: ReadonlyArray<never>;
  readonly token: AuthMeToken;
};
export const AuthMeResponse = Schema.Struct({
  user: AuthMeUser,
  orgs: Schema.Array(Schema.Never).annotate({
    description: "Organizations the user belongs to (reserved, currently empty).",
  }),
  token: AuthMeToken,
}).annotate({
  title: "Auth Me Response",
  description: "Your user profile, organizations, and token details.",
});
export type TokenListResponse = {
  readonly tokens: ReadonlyArray<TokenListItem>;
  readonly has_more: boolean;
  readonly cursor: string | null;
};
export const TokenListResponse = Schema.Struct({
  tokens: Schema.Array(TokenListItem).annotate({
    description: "List of access tokens for the authenticated user.",
  }),
  has_more: Schema.Boolean.annotate({
    description: "Whether additional tokens exist beyond this page.",
  }),
  cursor: Schema.Union([
    Schema.String.annotate({ description: "Opaque cursor for fetching the next page of results." }),
    Schema.Null,
  ]),
}).annotate({ title: "Token List Response", description: "A page of your access tokens." });
export type TeamList = { readonly items: ReadonlyArray<Team>; readonly nextCursor: string | null };
export const TeamList = Schema.Struct({
  items: Schema.Array(Team),
  nextCursor: Schema.Union([Schema.String, Schema.Null]),
}).annotate({ title: "Team List" });
export type TeamMembershipList = {
  readonly items: ReadonlyArray<TeamMembership>;
  readonly nextCursor: string | null;
};
export const TeamMembershipList = Schema.Struct({
  items: Schema.Array(TeamMembership),
  nextCursor: Schema.Union([Schema.String, Schema.Null]),
}).annotate({ title: "Team Membership List" });
export type ListCollection = { readonly items: ReadonlyArray<List> };
export const ListCollection = Schema.Struct({ items: Schema.Array(List) }).annotate({
  title: "List Collection",
});
export type ListDetail = { readonly list: List; readonly items: ReadonlyArray<ListItem> };
export const ListDetail = Schema.Struct({ list: List, items: Schema.Array(ListItem) }).annotate({
  title: "List Detail",
});
export type ExtensionIdentityMismatchError = {
  readonly kind: "ExtensionIdentityMismatchError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: "extension_identity_mismatch";
  readonly error: "extension_identity_mismatch";
  readonly identity: PublishIdentity;
  readonly mismatches: ReadonlyArray<PublishIdentityMismatchEntry>;
};
export const ExtensionIdentityMismatchError = Schema.Struct({
  kind: Schema.Literal("ExtensionIdentityMismatchError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  code: Schema.Literal("extension_identity_mismatch"),
  error: Schema.Literal("extension_identity_mismatch"),
  identity: PublishIdentity,
  mismatches: Schema.Array(PublishIdentityMismatchEntry),
});
export type SearchResponse = {
  readonly extensions: ReadonlyArray<SearchHit>;
  readonly has_more: boolean;
  readonly cursor: string | null;
};
export const SearchResponse = Schema.Struct({
  extensions: Schema.Array(SearchHit).annotate({
    description: "Extensions matching the query, ordered by recency.",
  }),
  has_more: Schema.Boolean.annotate({
    description: "Whether additional results exist beyond this page.",
  }),
  cursor: Schema.Union([
    Schema.String.annotate({ description: "Opaque cursor for fetching the next page of results." }),
    Schema.Null,
  ]),
}).annotate({
  title: "Search Response",
  description: "A page of extensions matching the search query.",
});
export type ExtensionLintFailedError = {
  readonly kind: "ExtensionLintFailedError";
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: "extension_lint_failed";
  readonly error: "extension_lint_failed";
  readonly identity: PublishIdentity;
  readonly displayRoot: string;
  readonly findings: ReadonlyArray<PublishLintFinding>;
};
export const ExtensionLintFailedError = Schema.Struct({
  kind: Schema.Literal("ExtensionLintFailedError"),
  type: Schema.String,
  title: Schema.String,
  status: Schema.Number.check(Schema.isInt()),
  detail: Schema.String,
  instance: Schema.optionalKey(Schema.String),
  code: Schema.Literal("extension_lint_failed"),
  error: Schema.Literal("extension_lint_failed"),
  identity: PublishIdentity,
  displayRoot: Schema.String,
  findings: Schema.Array(PublishLintFinding),
});
// schemas
export type MetaGet200 = MetaResponse;
export const MetaGet200 = MetaResponse;
export type MetaGet400 = DecodeErrorResponse;
export const MetaGet400 = DecodeErrorResponse;
export type AuthIssueDeviceCodeRequestFormUrlEncoded = {
  readonly client_id: string;
  readonly scope?: string | null;
};
export const AuthIssueDeviceCodeRequestFormUrlEncoded = Schema.Struct({
  client_id: Schema.String.check(
    Schema.isMinLength(1, {
      description: "OAuth public client identifier.",
      examples: ["example-client"],
    }),
  ),
  scope: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Optional space-delimited registry scopes requested by the client.",
      }),
      Schema.Null,
    ]),
  ),
});
export type AuthIssueDeviceCode200 = DeviceCodeResponse;
export const AuthIssueDeviceCode200 = DeviceCodeResponse;
export type AuthIssueDeviceCode400 = DecodeErrorResponse;
export const AuthIssueDeviceCode400 = DecodeErrorResponse;
export type AuthIssueDeviceCode500 = ProblemDetails;
export const AuthIssueDeviceCode500 = ProblemDetails;
export type AuthExchangeTokenRequestFormUrlEncoded = {
  readonly grant_type: string;
  readonly code?: string | null;
  readonly code_verifier?: string | null;
  readonly client_id?: string | null;
  readonly redirect_uri?: string | null;
  readonly device_code?: string | null;
  readonly refresh_token?: string | null;
  readonly scope?: string | null;
};
export const AuthExchangeTokenRequestFormUrlEncoded = Schema.Struct({
  grant_type: Schema.String.annotate({
    description: "OAuth grant type.",
    examples: [
      "authorization_code",
      "urn:ietf:params:oauth:grant-type:device_code",
      "refresh_token",
    ],
  }),
  code: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Authorization code returned to the loopback callback.",
      }),
      Schema.Null,
    ]),
  ),
  code_verifier: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({ description: "PKCE verifier generated by the CLI." }),
      Schema.Null,
    ]),
  ),
  client_id: Schema.optionalKey(
    Schema.Union([
      Schema.String.check(
        Schema.isMinLength(1, {
          description: "OAuth client identifier.",
          examples: ["example-client"],
        }),
      ),
      Schema.Null,
    ]),
  ),
  redirect_uri: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Loopback redirect URI the authorization code was bound to.",
      }),
      Schema.Null,
    ]),
  ),
  device_code: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "The device verification code received from the /device/code endpoint.",
      }),
      Schema.Null,
    ]),
  ),
  refresh_token: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({ description: "Refresh token to exchange for a new token pair." }),
      Schema.Null,
    ]),
  ),
  scope: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Optional requested scope for refresh-token exchange.",
      }),
      Schema.Null,
    ]),
  ),
});
export type AuthExchangeToken200 = SessionTokenResponse;
export const AuthExchangeToken200 = SessionTokenResponse;
export type AuthExchangeToken400 = ProblemDetails | DecodeErrorResponse | TokenOAuthError;
export const AuthExchangeToken400 = Schema.Union([
  Schema.Union([ProblemDetails, DecodeErrorResponse]),
  TokenOAuthError,
]);
export type AuthRefreshTokenRequestFormUrlEncoded = {
  readonly grant_type: "refresh_token";
  readonly refresh_token: string;
  readonly client_id?: string | null;
};
export const AuthRefreshTokenRequestFormUrlEncoded = Schema.Struct({
  grant_type: Schema.Literal("refresh_token").annotate({
    description: "OAuth grant type. Must be 'refresh_token'.",
  }),
  refresh_token: Schema.String.check(
    Schema.isMinLength(1, { description: "The refresh token to exchange for a new token pair." }),
  ),
  client_id: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({ description: "OAuth client identifier." }),
      Schema.Null,
    ]),
  ),
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
  access_token: Schema.String,
  refresh_token: Schema.String,
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Number.check(Schema.isInt()),
  expires_at: Schema.String,
  scope: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type AuthRefreshToken400 = TokenOAuthError | DecodeErrorResponse;
export const AuthRefreshToken400 = Schema.Union([TokenOAuthError, DecodeErrorResponse]);
export type AuthRevokeOAuthTokenRequestFormUrlEncoded = {
  readonly token: string;
  readonly token_type_hint?: "refresh_token" | "access_token" | null;
};
export const AuthRevokeOAuthTokenRequestFormUrlEncoded = Schema.Struct({
  token: Schema.String.check(
    Schema.isMinLength(1, {
      description: "The access token or refresh token to revoke. Revocation is idempotent.",
    }),
  ),
  token_type_hint: Schema.optionalKey(
    Schema.Union([
      Schema.Literals(["refresh_token", "access_token"]).annotate({
        description: "Optional RFC 7009 token type hint. Revocation remains non-enumerating.",
      }),
      Schema.Null,
    ]),
  ),
});
export type AuthRevokeOAuthToken400 = DecodeErrorResponse;
export const AuthRevokeOAuthToken400 = DecodeErrorResponse;
export type AuthGetWhoami200 = AuthWhoamiResponse;
export const AuthGetWhoami200 = AuthWhoamiResponse;
export type AuthGetWhoami400 = DecodeErrorResponse;
export const AuthGetWhoami400 = DecodeErrorResponse;
export type AuthGetWhoami401 = ProblemDetails;
export const AuthGetWhoami401 = ProblemDetails;
export type AuthGetMe200 = AuthMeResponse;
export const AuthGetMe200 = AuthMeResponse;
export type AuthGetMe400 = DecodeErrorResponse;
export const AuthGetMe400 = DecodeErrorResponse;
export type AuthGetMe401 = ProblemDetails;
export const AuthGetMe401 = ProblemDetails;
export type AuthGetStepUpChallenge200 = StepUpChallengeResponse;
export const AuthGetStepUpChallenge200 = StepUpChallengeResponse;
export type AuthGetStepUpChallenge400 = DecodeErrorResponse;
export const AuthGetStepUpChallenge400 = DecodeErrorResponse;
export type AuthGetStepUpChallenge401 = ProblemDetails;
export const AuthGetStepUpChallenge401 = ProblemDetails;
export type AuthGetStepUpChallenge404 = ProblemDetails;
export const AuthGetStepUpChallenge404 = ProblemDetails;
export type AuthExchangeOidcToken400 = DecodeErrorResponse;
export const AuthExchangeOidcToken400 = DecodeErrorResponse;
export type AuthExchangeOidcToken501 = ProblemDetails;
export const AuthExchangeOidcToken501 = ProblemDetails;
export type TokensListParams = { readonly cursor?: string | null; readonly limit?: string | null };
export const TokensListParams = Schema.Struct({
  cursor: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Opaque cursor from a previous response for pagination.",
      }),
      Schema.Null,
    ]),
  ),
  limit: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Maximum number of tokens to return (1–100, default 50).",
      }),
      Schema.Null,
    ]),
  ),
});
export type TokensList200 = TokenListResponse;
export const TokensList200 = TokenListResponse;
export type TokensList400 = DecodeErrorResponse;
export const TokensList400 = DecodeErrorResponse;
export type TokensList401 = ProblemDetails;
export const TokensList401 = ProblemDetails;
export type TokensList403 = ForbiddenError;
export const TokensList403 = ForbiddenError;
export type TokensCreateRequestJson = CreateTokenRequest;
export const TokensCreateRequestJson = CreateTokenRequest;
export type TokensCreate201 = CreateTokenResponse;
export const TokensCreate201 = CreateTokenResponse;
export type TokensCreate400 = DecodeErrorResponse;
export const TokensCreate400 = DecodeErrorResponse;
export type TokensCreate401 = ProblemDetails;
export const TokensCreate401 = ProblemDetails;
export type TokensCreate403 = ForbiddenError | ForbiddenError;
export const TokensCreate403 = Schema.Union([ForbiddenError, ForbiddenError]);
export type TokensCreate422 = ProblemDetails;
export const TokensCreate422 = ProblemDetails;
export type TokensDelete400 = DecodeErrorResponse;
export const TokensDelete400 = DecodeErrorResponse;
export type TokensDelete401 = StepUpRequiredError | ProblemDetails;
export const TokensDelete401 = Schema.Union([StepUpRequiredError, ProblemDetails]);
export type TokensDelete403 = ForbiddenError;
export const TokensDelete403 = ForbiddenError;
export type OwnersGetOwner200 = OwnerResponse;
export const OwnersGetOwner200 = OwnerResponse;
export type OwnersGetOwner400 = DecodeErrorResponse;
export const OwnersGetOwner400 = DecodeErrorResponse;
export type OwnersGetOwner404 = ProblemDetails;
export const OwnersGetOwner404 = ProblemDetails;
export type OrgsTeamsListTeamsParams = {
  readonly cursor?: string | null;
  readonly limit?: string | null;
};
export const OrgsTeamsListTeamsParams = Schema.Struct({
  cursor: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  limit: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type OrgsTeamsListTeams200 = TeamList;
export const OrgsTeamsListTeams200 = TeamList;
export type OrgsTeamsListTeams400 = DecodeErrorResponse;
export const OrgsTeamsListTeams400 = DecodeErrorResponse;
export type OrgsTeamsListTeams401 = ProblemDetails;
export const OrgsTeamsListTeams401 = ProblemDetails;
export type OrgsTeamsListTeams404 = ProblemDetails;
export const OrgsTeamsListTeams404 = ProblemDetails;
export type OrgsTeamsCreateTeamRequestJson = CreateTeamBody;
export const OrgsTeamsCreateTeamRequestJson = CreateTeamBody;
export type OrgsTeamsCreateTeam200 = Team;
export const OrgsTeamsCreateTeam200 = Team;
export type OrgsTeamsCreateTeam400 = ProblemDetails | DecodeErrorResponse;
export const OrgsTeamsCreateTeam400 = Schema.Union([ProblemDetails, DecodeErrorResponse]);
export type OrgsTeamsCreateTeam401 = ProblemDetails;
export const OrgsTeamsCreateTeam401 = ProblemDetails;
export type OrgsTeamsCreateTeam403 = ForbiddenError;
export const OrgsTeamsCreateTeam403 = ForbiddenError;
export type OrgsTeamsCreateTeam404 = ProblemDetails;
export const OrgsTeamsCreateTeam404 = ProblemDetails;
export type OrgsTeamsGetTeam200 = Team;
export const OrgsTeamsGetTeam200 = Team;
export type OrgsTeamsGetTeam400 = DecodeErrorResponse;
export const OrgsTeamsGetTeam400 = DecodeErrorResponse;
export type OrgsTeamsGetTeam401 = ProblemDetails;
export const OrgsTeamsGetTeam401 = ProblemDetails;
export type OrgsTeamsGetTeam404 = ProblemDetails;
export const OrgsTeamsGetTeam404 = ProblemDetails;
export type OrgsTeamsDeleteTeam400 = DecodeErrorResponse;
export const OrgsTeamsDeleteTeam400 = DecodeErrorResponse;
export type OrgsTeamsDeleteTeam401 = ProblemDetails;
export const OrgsTeamsDeleteTeam401 = ProblemDetails;
export type OrgsTeamsDeleteTeam403 = ForbiddenError;
export const OrgsTeamsDeleteTeam403 = ForbiddenError;
export type OrgsTeamsDeleteTeam404 = ProblemDetails;
export const OrgsTeamsDeleteTeam404 = ProblemDetails;
export type OrgsTeamsUpdateTeamRequestJson = UpdateTeamBody;
export const OrgsTeamsUpdateTeamRequestJson = UpdateTeamBody;
export type OrgsTeamsUpdateTeam200 = Team;
export const OrgsTeamsUpdateTeam200 = Team;
export type OrgsTeamsUpdateTeam400 = ProblemDetails | DecodeErrorResponse;
export const OrgsTeamsUpdateTeam400 = Schema.Union([ProblemDetails, DecodeErrorResponse]);
export type OrgsTeamsUpdateTeam401 = ProblemDetails;
export const OrgsTeamsUpdateTeam401 = ProblemDetails;
export type OrgsTeamsUpdateTeam403 = ForbiddenError;
export const OrgsTeamsUpdateTeam403 = ForbiddenError;
export type OrgsTeamsUpdateTeam404 = ProblemDetails;
export const OrgsTeamsUpdateTeam404 = ProblemDetails;
export type OrgsTeamsListTeamMembersParams = {
  readonly cursor?: string | null;
  readonly limit?: string | null;
};
export const OrgsTeamsListTeamMembersParams = Schema.Struct({
  cursor: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  limit: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type OrgsTeamsListTeamMembers200 = TeamMembershipList;
export const OrgsTeamsListTeamMembers200 = TeamMembershipList;
export type OrgsTeamsListTeamMembers400 = DecodeErrorResponse;
export const OrgsTeamsListTeamMembers400 = DecodeErrorResponse;
export type OrgsTeamsListTeamMembers401 = ProblemDetails;
export const OrgsTeamsListTeamMembers401 = ProblemDetails;
export type OrgsTeamsListTeamMembers404 = ProblemDetails;
export const OrgsTeamsListTeamMembers404 = ProblemDetails;
export type OrgsTeamsAddTeamMemberRequestJson = AddTeamMemberBody;
export const OrgsTeamsAddTeamMemberRequestJson = AddTeamMemberBody;
export type OrgsTeamsAddTeamMember200 = TeamMembership;
export const OrgsTeamsAddTeamMember200 = TeamMembership;
export type OrgsTeamsAddTeamMember400 = DecodeErrorResponse;
export const OrgsTeamsAddTeamMember400 = DecodeErrorResponse;
export type OrgsTeamsAddTeamMember401 = ProblemDetails;
export const OrgsTeamsAddTeamMember401 = ProblemDetails;
export type OrgsTeamsAddTeamMember403 = ForbiddenError;
export const OrgsTeamsAddTeamMember403 = ForbiddenError;
export type OrgsTeamsAddTeamMember404 = ProblemDetails;
export const OrgsTeamsAddTeamMember404 = ProblemDetails;
export type OrgsTeamsAddTeamMember422 = ProblemDetails;
export const OrgsTeamsAddTeamMember422 = ProblemDetails;
export type OrgsTeamsRemoveTeamMember400 = DecodeErrorResponse;
export const OrgsTeamsRemoveTeamMember400 = DecodeErrorResponse;
export type OrgsTeamsRemoveTeamMember401 = ProblemDetails;
export const OrgsTeamsRemoveTeamMember401 = ProblemDetails;
export type OrgsTeamsRemoveTeamMember403 = ForbiddenError;
export const OrgsTeamsRemoveTeamMember403 = ForbiddenError;
export type OrgsTeamsRemoveTeamMember404 = ProblemDetails;
export const OrgsTeamsRemoveTeamMember404 = ProblemDetails;
export type OrgsTeamsChangeTeamMemberRoleRequestJson = ChangeTeamMemberRoleBody;
export const OrgsTeamsChangeTeamMemberRoleRequestJson = ChangeTeamMemberRoleBody;
export type OrgsTeamsChangeTeamMemberRole200 = TeamMembership;
export const OrgsTeamsChangeTeamMemberRole200 = TeamMembership;
export type OrgsTeamsChangeTeamMemberRole400 = DecodeErrorResponse;
export const OrgsTeamsChangeTeamMemberRole400 = DecodeErrorResponse;
export type OrgsTeamsChangeTeamMemberRole401 = ProblemDetails;
export const OrgsTeamsChangeTeamMemberRole401 = ProblemDetails;
export type OrgsTeamsChangeTeamMemberRole403 = ForbiddenError;
export const OrgsTeamsChangeTeamMemberRole403 = ForbiddenError;
export type OrgsTeamsChangeTeamMemberRole404 = ProblemDetails;
export const OrgsTeamsChangeTeamMemberRole404 = ProblemDetails;
export type ListsListLists200 = ListCollection;
export const ListsListLists200 = ListCollection;
export type ListsListLists400 = DecodeErrorResponse;
export const ListsListLists400 = DecodeErrorResponse;
export type ListsListLists404 = ProblemDetails;
export const ListsListLists404 = ProblemDetails;
export type ListsCreateListRequestJson = CreateListBody;
export const ListsCreateListRequestJson = CreateListBody;
export type ListsCreateList200 = List;
export const ListsCreateList200 = List;
export type ListsCreateList400 = ProblemDetails | DecodeErrorResponse;
export const ListsCreateList400 = Schema.Union([ProblemDetails, DecodeErrorResponse]);
export type ListsCreateList401 = ProblemDetails;
export const ListsCreateList401 = ProblemDetails;
export type ListsCreateList403 = ForbiddenError;
export const ListsCreateList403 = ForbiddenError;
export type ListsCreateList404 = ProblemDetails;
export const ListsCreateList404 = ProblemDetails;
export type ListsCreateList409 = ProblemDetails;
export const ListsCreateList409 = ProblemDetails;
export type ListsCreateList422 = ProblemDetails;
export const ListsCreateList422 = ProblemDetails;
export type ListsGetList200 = ListDetail;
export const ListsGetList200 = ListDetail;
export type ListsGetList400 = ProblemDetails | DecodeErrorResponse;
export const ListsGetList400 = Schema.Union([ProblemDetails, DecodeErrorResponse]);
export type ListsGetList404 = ProblemDetails;
export const ListsGetList404 = ProblemDetails;
export type ListsDeleteList400 = ProblemDetails | DecodeErrorResponse;
export const ListsDeleteList400 = Schema.Union([ProblemDetails, DecodeErrorResponse]);
export type ListsDeleteList401 = ProblemDetails;
export const ListsDeleteList401 = ProblemDetails;
export type ListsDeleteList403 = ForbiddenError;
export const ListsDeleteList403 = ForbiddenError;
export type ListsDeleteList404 = ProblemDetails;
export const ListsDeleteList404 = ProblemDetails;
export type ListsUpdateListRequestJson = UpdateListBody;
export const ListsUpdateListRequestJson = UpdateListBody;
export type ListsUpdateList200 = List;
export const ListsUpdateList200 = List;
export type ListsUpdateList400 = ProblemDetails | DecodeErrorResponse;
export const ListsUpdateList400 = Schema.Union([ProblemDetails, DecodeErrorResponse]);
export type ListsUpdateList401 = ProblemDetails;
export const ListsUpdateList401 = ProblemDetails;
export type ListsUpdateList403 = ForbiddenError;
export const ListsUpdateList403 = ForbiddenError;
export type ListsUpdateList404 = ProblemDetails;
export const ListsUpdateList404 = ProblemDetails;
export type ListsUpdateList409 = ProblemDetails;
export const ListsUpdateList409 = ProblemDetails;
export type ListsUpdateList422 = ProblemDetails;
export const ListsUpdateList422 = ProblemDetails;
export type ListsAddListItemRequestJson = AddListItemBody;
export const ListsAddListItemRequestJson = AddListItemBody;
export type ListsAddListItem200 = ListItem;
export const ListsAddListItem200 = ListItem;
export type ListsAddListItem400 = ProblemDetails | DecodeErrorResponse;
export const ListsAddListItem400 = Schema.Union([ProblemDetails, DecodeErrorResponse]);
export type ListsAddListItem401 = ProblemDetails;
export const ListsAddListItem401 = ProblemDetails;
export type ListsAddListItem403 = ForbiddenError;
export const ListsAddListItem403 = ForbiddenError;
export type ListsAddListItem404 = ProblemDetails;
export const ListsAddListItem404 = ProblemDetails;
export type ListsAddListItem409 = ProblemDetails;
export const ListsAddListItem409 = ProblemDetails;
export type ListsRemoveListItemParams = { readonly extensionOwner?: Handle | null };
export const ListsRemoveListItemParams = Schema.Struct({
  extensionOwner: Schema.optionalKey(Schema.Union([Handle, Schema.Null])),
});
export type ListsRemoveListItem400 = ProblemDetails | DecodeErrorResponse;
export const ListsRemoveListItem400 = Schema.Union([ProblemDetails, DecodeErrorResponse]);
export type ListsRemoveListItem401 = ProblemDetails;
export const ListsRemoveListItem401 = ProblemDetails;
export type ListsRemoveListItem403 = ForbiddenError;
export const ListsRemoveListItem403 = ForbiddenError;
export type ListsRemoveListItem404 = ProblemDetails;
export const ListsRemoveListItem404 = ProblemDetails;
export type ExtensionsListByOwner200 = {
  readonly extensions: ReadonlyArray<{
    readonly name: ExtensionName;
    readonly owner: Handle;
    readonly type: ExtensionType;
    readonly latestVersion: Version;
    readonly description?: string | null;
    readonly repository?: Repository | null;
    readonly license?: LicenseExpression | null;
    readonly authors?: ReadonlyArray<Author> | null;
    readonly visibility?: string | null;
    readonly deprecated_at?: IsoDateTimeString | null;
    readonly deprecation_notice?: string | null;
  }>;
};
export const ExtensionsListByOwner200 = Schema.Struct({
  extensions: Schema.Array(
    Schema.Struct({
      name: ExtensionName,
      owner: Handle,
      type: ExtensionType,
      latestVersion: Version,
      description: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      repository: Schema.optionalKey(Schema.Union([Repository, Schema.Null])),
      license: Schema.optionalKey(Schema.Union([LicenseExpression, Schema.Null])),
      authors: Schema.optionalKey(Schema.Union([Schema.Array(Author), Schema.Null])),
      visibility: Schema.optionalKey(
        Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
      ),
      deprecated_at: Schema.optionalKey(Schema.Union([IsoDateTimeString, Schema.Null])),
      deprecation_notice: Schema.optionalKey(
        Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
      ),
    }),
  ),
});
export type ExtensionsListByOwner400 = DecodeErrorResponse;
export const ExtensionsListByOwner400 = DecodeErrorResponse;
export type ExtensionsListByType200 = {
  readonly extensions: ReadonlyArray<{
    readonly name: ExtensionName;
    readonly owner: Handle;
    readonly type: ExtensionType;
    readonly latestVersion: Version;
    readonly description?: string | null;
    readonly repository?: Repository | null;
    readonly license?: LicenseExpression | null;
    readonly authors?: ReadonlyArray<Author> | null;
    readonly visibility?: string | null;
    readonly deprecated_at?: IsoDateTimeString | null;
    readonly deprecation_notice?: string | null;
  }>;
};
export const ExtensionsListByType200 = Schema.Struct({
  extensions: Schema.Array(
    Schema.Struct({
      name: ExtensionName,
      owner: Handle,
      type: ExtensionType,
      latestVersion: Version,
      description: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
      repository: Schema.optionalKey(Schema.Union([Repository, Schema.Null])),
      license: Schema.optionalKey(Schema.Union([LicenseExpression, Schema.Null])),
      authors: Schema.optionalKey(Schema.Union([Schema.Array(Author), Schema.Null])),
      visibility: Schema.optionalKey(
        Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
      ),
      deprecated_at: Schema.optionalKey(Schema.Union([IsoDateTimeString, Schema.Null])),
      deprecation_notice: Schema.optionalKey(
        Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
      ),
    }),
  ),
});
export type ExtensionsListByType400 = DecodeErrorResponse;
export const ExtensionsListByType400 = DecodeErrorResponse;
export type ExtensionsGet200 = {
  readonly name: ExtensionName;
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly description?: string | null;
  readonly repository?: Repository | null;
  readonly bugs?: Bugs | null;
  readonly license?: LicenseExpression | null;
  readonly authors?: ReadonlyArray<Author> | null;
  readonly versions: ReadonlyArray<{
    readonly version: Version;
    readonly published: IsoDateTimeString;
    readonly integrity: string;
    readonly dependencies?: { readonly [x: string]: VersionRange } | null;
    readonly packages?: ReadonlyArray<CompanionPackage> | null;
    readonly yanked_at?: IsoDateTimeString | null;
  }>;
  readonly visibility?: "public" | "internal" | "private" | null;
  readonly deprecated_at?: IsoDateTimeString | null;
  readonly deprecation_notice?: string | null;
};
export const ExtensionsGet200 = Schema.Struct({
  name: ExtensionName,
  owner: Handle,
  type: ExtensionType,
  description: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  repository: Schema.optionalKey(Schema.Union([Repository, Schema.Null])),
  bugs: Schema.optionalKey(Schema.Union([Bugs, Schema.Null])),
  license: Schema.optionalKey(Schema.Union([LicenseExpression, Schema.Null])),
  authors: Schema.optionalKey(Schema.Union([Schema.Array(Author), Schema.Null])),
  versions: Schema.Array(
    Schema.Struct({
      version: Version,
      published: IsoDateTimeString,
      integrity: Schema.String.annotate({ readOnly: true }),
      dependencies: Schema.optionalKey(
        Schema.Union([Schema.Record(Schema.String, VersionRange), Schema.Null]),
      ),
      packages: Schema.optionalKey(Schema.Union([Schema.Array(CompanionPackage), Schema.Null])),
      yanked_at: Schema.optionalKey(Schema.Union([IsoDateTimeString, Schema.Null])),
    }),
  ),
  visibility: Schema.optionalKey(
    Schema.Union([
      Schema.Literals(["public", "internal", "private"]).annotate({ readOnly: true }),
      Schema.Null,
    ]),
  ),
  deprecated_at: Schema.optionalKey(Schema.Union([IsoDateTimeString, Schema.Null])),
  deprecation_notice: Schema.optionalKey(
    Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
  ),
});
export type ExtensionsGet400 = DecodeErrorResponse;
export const ExtensionsGet400 = DecodeErrorResponse;
export type ExtensionsGet404 = ProblemDetails;
export const ExtensionsGet404 = ProblemDetails;
export type ExtensionsUpdateVisibilityRequestJson = PatchVisibilityBody;
export const ExtensionsUpdateVisibilityRequestJson = PatchVisibilityBody;
export type ExtensionsUpdateVisibility200 = {
  readonly id: ExtensionId;
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly visibility: string;
  readonly listed: boolean;
  readonly updatedAt: string;
  readonly links: ExtensionLinks;
};
export const ExtensionsUpdateVisibility200 = Schema.Struct({
  id: ExtensionId,
  owner: Handle,
  type: ExtensionType,
  name: ExtensionName,
  visibility: Schema.String,
  listed: Schema.Boolean,
  updatedAt: Schema.String.annotate({ readOnly: true, format: "date-time" }),
  links: ExtensionLinks,
});
export type ExtensionsUpdateVisibility400 = ProblemDetails | DecodeErrorResponse;
export const ExtensionsUpdateVisibility400 = Schema.Union([ProblemDetails, DecodeErrorResponse]);
export type ExtensionsUpdateVisibility401 = ProblemDetails;
export const ExtensionsUpdateVisibility401 = ProblemDetails;
export type ExtensionsUpdateVisibility403 = ForbiddenError | ForbiddenError;
export const ExtensionsUpdateVisibility403 = Schema.Union([ForbiddenError, ForbiddenError]);
export type ExtensionsUpdateVisibility404 = ProblemDetails;
export const ExtensionsUpdateVisibility404 = ProblemDetails;
export type ExtensionsUpdateVisibility422 = ProblemDetails;
export const ExtensionsUpdateVisibility422 = ProblemDetails;
export type ExtensionsGetVersion200 = {
  readonly name: ExtensionName;
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly version: Version;
  readonly status: "pending" | "available" | "failed";
  readonly published: IsoDateTimeString;
  readonly integrity: string;
  readonly description?: string | null;
  readonly repository?: Repository | null;
  readonly bugs?: Bugs | null;
  readonly license?: LicenseExpression | null;
  readonly authors?: ReadonlyArray<Author> | null;
  readonly dependencies?: { readonly [x: string]: VersionRange } | null;
  readonly packages?: ReadonlyArray<CompanionPackage> | null;
  readonly yanked_at?: IsoDateTimeString | null;
  readonly deleted_at?: IsoDateTimeString | null;
};
export const ExtensionsGetVersion200 = Schema.Struct({
  name: ExtensionName,
  owner: Handle,
  type: ExtensionType,
  version: Version,
  status: Schema.Literals(["pending", "available", "failed"]).annotate({ readOnly: true }),
  published: IsoDateTimeString,
  integrity: Schema.String.annotate({ readOnly: true }),
  description: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  repository: Schema.optionalKey(Schema.Union([Repository, Schema.Null])),
  bugs: Schema.optionalKey(Schema.Union([Bugs, Schema.Null])),
  license: Schema.optionalKey(Schema.Union([LicenseExpression, Schema.Null])),
  authors: Schema.optionalKey(Schema.Union([Schema.Array(Author), Schema.Null])),
  dependencies: Schema.optionalKey(
    Schema.Union([Schema.Record(Schema.String, VersionRange), Schema.Null]),
  ),
  packages: Schema.optionalKey(Schema.Union([Schema.Array(CompanionPackage), Schema.Null])),
  yanked_at: Schema.optionalKey(Schema.Union([IsoDateTimeString, Schema.Null])),
  deleted_at: Schema.optionalKey(Schema.Union([IsoDateTimeString, Schema.Null])),
});
export type ExtensionsGetVersion400 = DecodeErrorResponse;
export const ExtensionsGetVersion400 = DecodeErrorResponse;
export type ExtensionsGetVersion404 = ProblemDetails;
export const ExtensionsGetVersion404 = ProblemDetails;
export type ExtensionsPublishVersionRequestFormData = {
  readonly archive: string;
  readonly integrity?: string | null;
};
export const ExtensionsPublishVersionRequestFormData = Schema.Struct({
  archive: Schema.String.annotate({ description: "Extension archive multipart file part." }),
  integrity: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type ExtensionsPublishVersion201 = {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
  readonly integrity: string;
  readonly sha256_hex: string;
  readonly published_at: IsoDateTimeString;
  readonly publish_status: "pending" | "available" | "failed";
  readonly links: ExtensionLinks;
};
export const ExtensionsPublishVersion201 = Schema.Struct({
  owner: Handle,
  type: ExtensionType,
  name: ExtensionName,
  version: Version,
  integrity: Schema.String.annotate({ readOnly: true }),
  sha256_hex: Schema.String.annotate({ readOnly: true }),
  published_at: IsoDateTimeString,
  publish_status: Schema.Literals(["pending", "available", "failed"]).annotate({ readOnly: true }),
  links: ExtensionLinks,
});
export type ExtensionsPublishVersion400 = ProblemDetails | DecodeErrorResponse;
export const ExtensionsPublishVersion400 = Schema.Union([ProblemDetails, DecodeErrorResponse]);
export type ExtensionsPublishVersion401 = ProblemDetails;
export const ExtensionsPublishVersion401 = ProblemDetails;
export type ExtensionsPublishVersion403 = ForbiddenError | ForbiddenError;
export const ExtensionsPublishVersion403 = Schema.Union([ForbiddenError, ForbiddenError]);
export type ExtensionsPublishVersion404 = ProblemDetails;
export const ExtensionsPublishVersion404 = ProblemDetails;
export type ExtensionsPublishVersion409 = ProblemDetails;
export const ExtensionsPublishVersion409 = ProblemDetails;
export type ExtensionsPublishVersion413 = ProblemDetails;
export const ExtensionsPublishVersion413 = ProblemDetails;
export type ExtensionsPublishVersion415 = ProblemDetails;
export const ExtensionsPublishVersion415 = ProblemDetails;
export type ExtensionsPublishVersion422 =
  | ProblemDetails
  | ExtensionLintFailedError
  | ExtensionIdentityMismatchError;
export const ExtensionsPublishVersion422 = Schema.Union([
  ProblemDetails,
  ExtensionLintFailedError,
  ExtensionIdentityMismatchError,
]);
export type ExtensionsPublishVersion429 = ProblemDetails;
export const ExtensionsPublishVersion429 = ProblemDetails;
export type ExtensionsPublishVersion500 = ProblemDetails;
export const ExtensionsPublishVersion500 = ProblemDetails;
export type ExtensionsPublishVersion503 = ProblemDetails;
export const ExtensionsPublishVersion503 = ProblemDetails;
export type ExtensionsDeleteVersion400 = DecodeErrorResponse;
export const ExtensionsDeleteVersion400 = DecodeErrorResponse;
export type ExtensionsDeleteVersion401 = ProblemDetails;
export const ExtensionsDeleteVersion401 = ProblemDetails;
export type ExtensionsDeleteVersion403 = ForbiddenError;
export const ExtensionsDeleteVersion403 = ForbiddenError;
export type ExtensionsDeleteVersion404 = ProblemDetails;
export const ExtensionsDeleteVersion404 = ProblemDetails;
export type ExtensionsDownloadArchive400 = DecodeErrorResponse;
export const ExtensionsDownloadArchive400 = DecodeErrorResponse;
export type ExtensionsDownloadArchive404 = ProblemDetails;
export const ExtensionsDownloadArchive404 = ProblemDetails;
export type ExtensionsDownloadArchive500 = ProblemDetails;
export const ExtensionsDownloadArchive500 = ProblemDetails;
export type ExtensionsDeprecateRequestJson = DeprecateBody;
export const ExtensionsDeprecateRequestJson = DeprecateBody;
export type ExtensionsDeprecate200 = {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly deprecatedAt: string | null;
  readonly deprecationNotice: string | null;
};
export const ExtensionsDeprecate200 = Schema.Struct({
  owner: Handle,
  type: ExtensionType,
  name: ExtensionName,
  deprecatedAt: Schema.Union([
    Schema.String.annotate({ readOnly: true, format: "date-time" }),
    Schema.Null,
  ]),
  deprecationNotice: Schema.Union([Schema.String.annotate({ readOnly: true }), Schema.Null]),
});
export type ExtensionsDeprecate400 = DecodeErrorResponse;
export const ExtensionsDeprecate400 = DecodeErrorResponse;
export type ExtensionsDeprecate401 = ProblemDetails;
export const ExtensionsDeprecate401 = ProblemDetails;
export type ExtensionsDeprecate403 = ForbiddenError;
export const ExtensionsDeprecate403 = ForbiddenError;
export type ExtensionsDeprecate404 = ProblemDetails;
export const ExtensionsDeprecate404 = ProblemDetails;
export type ExtensionsUndeprecate200 = {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly deprecatedAt: null;
  readonly deprecationNotice: null;
};
export const ExtensionsUndeprecate200 = Schema.Struct({
  owner: Handle,
  type: ExtensionType,
  name: ExtensionName,
  deprecatedAt: Schema.Null,
  deprecationNotice: Schema.Null,
});
export type ExtensionsUndeprecate400 = DecodeErrorResponse;
export const ExtensionsUndeprecate400 = DecodeErrorResponse;
export type ExtensionsUndeprecate401 = ProblemDetails;
export const ExtensionsUndeprecate401 = ProblemDetails;
export type ExtensionsUndeprecate403 = ForbiddenError;
export const ExtensionsUndeprecate403 = ForbiddenError;
export type ExtensionsUndeprecate404 = ProblemDetails;
export const ExtensionsUndeprecate404 = ProblemDetails;
export type ExtensionsYankVersion200 = {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
  readonly yankedAt: IsoDateTimeString | null;
  readonly links: ExtensionLinks;
};
export const ExtensionsYankVersion200 = Schema.Struct({
  owner: Handle,
  type: ExtensionType,
  name: ExtensionName,
  version: Version,
  yankedAt: Schema.Union([IsoDateTimeString, Schema.Null]),
  links: ExtensionLinks,
});
export type ExtensionsYankVersion400 = DecodeErrorResponse;
export const ExtensionsYankVersion400 = DecodeErrorResponse;
export type ExtensionsYankVersion401 = StepUpRequiredError | ProblemDetails;
export const ExtensionsYankVersion401 = Schema.Union([StepUpRequiredError, ProblemDetails]);
export type ExtensionsYankVersion403 = ForbiddenError;
export const ExtensionsYankVersion403 = ForbiddenError;
export type ExtensionsYankVersion404 = ProblemDetails;
export const ExtensionsYankVersion404 = ProblemDetails;
export type ExtensionsUnyankVersion200 = {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
  readonly yankedAt: null;
  readonly links: ExtensionLinks;
};
export const ExtensionsUnyankVersion200 = Schema.Struct({
  owner: Handle,
  type: ExtensionType,
  name: ExtensionName,
  version: Version,
  yankedAt: Schema.Null,
  links: ExtensionLinks,
});
export type ExtensionsUnyankVersion400 = DecodeErrorResponse;
export const ExtensionsUnyankVersion400 = DecodeErrorResponse;
export type ExtensionsUnyankVersion401 = StepUpRequiredError | ProblemDetails;
export const ExtensionsUnyankVersion401 = Schema.Union([StepUpRequiredError, ProblemDetails]);
export type ExtensionsUnyankVersion403 = ForbiddenError;
export const ExtensionsUnyankVersion403 = ForbiddenError;
export type ExtensionsUnyankVersion404 = ProblemDetails;
export const ExtensionsUnyankVersion404 = ProblemDetails;
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
export type CollaboratorsListCollaborators401 = ProblemDetails;
export const CollaboratorsListCollaborators401 = ProblemDetails;
export type CollaboratorsListCollaborators403 = ForbiddenError | ForbiddenError;
export const CollaboratorsListCollaborators403 = Schema.Union([ForbiddenError, ForbiddenError]);
export type CollaboratorsListCollaborators404 = ProblemDetails;
export const CollaboratorsListCollaborators404 = ProblemDetails;
export type CollaboratorsUpsertCollaboratorRequestJson = PutCollaboratorBody;
export const CollaboratorsUpsertCollaboratorRequestJson = PutCollaboratorBody;
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
export type CollaboratorsUpsertCollaborator400 = ProblemDetails | DecodeErrorResponse;
export const CollaboratorsUpsertCollaborator400 = Schema.Union([
  ProblemDetails,
  DecodeErrorResponse,
]);
export type CollaboratorsUpsertCollaborator401 = ProblemDetails;
export const CollaboratorsUpsertCollaborator401 = ProblemDetails;
export type CollaboratorsUpsertCollaborator403 = ForbiddenError | ForbiddenError;
export const CollaboratorsUpsertCollaborator403 = Schema.Union([ForbiddenError, ForbiddenError]);
export type CollaboratorsUpsertCollaborator404 = ProblemDetails;
export const CollaboratorsUpsertCollaborator404 = ProblemDetails;
export type CollaboratorsDeleteCollaborator400 = DecodeErrorResponse;
export const CollaboratorsDeleteCollaborator400 = DecodeErrorResponse;
export type CollaboratorsDeleteCollaborator401 = ProblemDetails;
export const CollaboratorsDeleteCollaborator401 = ProblemDetails;
export type CollaboratorsDeleteCollaborator403 = ForbiddenError | ForbiddenError;
export const CollaboratorsDeleteCollaborator403 = Schema.Union([ForbiddenError, ForbiddenError]);
export type CollaboratorsDeleteCollaborator404 = ProblemDetails;
export const CollaboratorsDeleteCollaborator404 = ProblemDetails;
export type CollaboratorsDeleteCollaborator409 = ProblemDetails;
export const CollaboratorsDeleteCollaborator409 = ProblemDetails;
export type TeamGrantsUpsertTeamExtensionGrantRequestJson = UpsertTeamGrantBody;
export const TeamGrantsUpsertTeamExtensionGrantRequestJson = UpsertTeamGrantBody;
export type TeamGrantsUpsertTeamExtensionGrant200 = TeamGrant;
export const TeamGrantsUpsertTeamExtensionGrant200 = TeamGrant;
export type TeamGrantsUpsertTeamExtensionGrant400 = DecodeErrorResponse;
export const TeamGrantsUpsertTeamExtensionGrant400 = DecodeErrorResponse;
export type TeamGrantsUpsertTeamExtensionGrant401 = ProblemDetails;
export const TeamGrantsUpsertTeamExtensionGrant401 = ProblemDetails;
export type TeamGrantsUpsertTeamExtensionGrant403 = ForbiddenError | ForbiddenError;
export const TeamGrantsUpsertTeamExtensionGrant403 = Schema.Union([ForbiddenError, ForbiddenError]);
export type TeamGrantsUpsertTeamExtensionGrant404 = ProblemDetails;
export const TeamGrantsUpsertTeamExtensionGrant404 = ProblemDetails;
export type TeamGrantsUpsertTeamExtensionGrant422 = ProblemDetails;
export const TeamGrantsUpsertTeamExtensionGrant422 = ProblemDetails;
export type TeamGrantsDeleteTeamExtensionGrant400 = DecodeErrorResponse;
export const TeamGrantsDeleteTeamExtensionGrant400 = DecodeErrorResponse;
export type TeamGrantsDeleteTeamExtensionGrant401 = ProblemDetails;
export const TeamGrantsDeleteTeamExtensionGrant401 = ProblemDetails;
export type TeamGrantsDeleteTeamExtensionGrant403 = ForbiddenError | ForbiddenError;
export const TeamGrantsDeleteTeamExtensionGrant403 = Schema.Union([ForbiddenError, ForbiddenError]);
export type TeamGrantsDeleteTeamExtensionGrant404 = ProblemDetails;
export const TeamGrantsDeleteTeamExtensionGrant404 = ProblemDetails;
export type DiscoveryPostDiscoveryRequestJson = {
  readonly client: { readonly axmVersion: string };
  readonly packages: ReadonlyArray<{
    readonly purl: string;
    readonly version: string;
    readonly declaredExtensions: ReadonlyArray<{
      readonly ref: ExtensionFqn;
      readonly versionRange?: string | null;
    }>;
  }>;
};
export const DiscoveryPostDiscoveryRequestJson = Schema.Struct({
  client: Schema.Struct({ axmVersion: Schema.String }),
  packages: Schema.Array(
    Schema.Struct({
      purl: Schema.String,
      version: Schema.String,
      declaredExtensions: Schema.Array(
        Schema.Struct({
          ref: ExtensionFqn,
          versionRange: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
        }),
      ),
    }),
  ),
});
export type DiscoveryPostDiscovery200 = {
  readonly results: ReadonlyArray<{
    readonly purl: string;
    readonly version: string;
    readonly status: "resolved" | "invalid_purl";
    readonly extensions: ReadonlyArray<{
      readonly ref: string;
      readonly resolved: boolean;
      readonly extension?: {
        readonly owner: string;
        readonly type: string;
        readonly name: string;
        readonly installVersion: string;
      } | null;
      readonly attestedBy: ReadonlyArray<"package" | "extension">;
      readonly official: boolean;
      readonly packageVersionInRange: boolean;
    }>;
  }>;
};
export const DiscoveryPostDiscovery200 = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      purl: Schema.String,
      version: Schema.String,
      status: Schema.Literals(["resolved", "invalid_purl"]),
      extensions: Schema.Array(
        Schema.Struct({
          ref: Schema.String,
          resolved: Schema.Boolean,
          extension: Schema.optionalKey(
            Schema.Union([
              Schema.Struct({
                owner: Schema.String,
                type: Schema.String,
                name: Schema.String,
                installVersion: Schema.String,
              }),
              Schema.Null,
            ]),
          ),
          attestedBy: Schema.Array(Schema.Literals(["package", "extension"])),
          official: Schema.Boolean,
          packageVersionInRange: Schema.Boolean,
        }),
      ),
    }),
  ),
});
export type DiscoveryPostDiscovery400 = ProblemDetails | DecodeErrorResponse;
export const DiscoveryPostDiscovery400 = Schema.Union([ProblemDetails, DecodeErrorResponse]);
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
  readonly scenario?: "effect-handled-500" | "surface-unhandled-500" | null;
  readonly scenarioId?: string | null;
};
export const HealthGetObservabilityVerificationParams = Schema.Struct({
  "x-health-key": Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  level: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  scenario: Schema.optionalKey(
    Schema.Union([Schema.Literals(["effect-handled-500", "surface-unhandled-500"]), Schema.Null]),
  ),
  scenarioId: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
});
export type HealthGetObservabilityVerification200 = {
  readonly status: "ok" | "warn" | "error";
  readonly timestamp: string;
  readonly serviceId: string;
  readonly level: "basic" | "standard" | "full";
  readonly checks: {
    readonly logging?: {
      readonly status: "ok" | "warn" | "error";
      readonly correlationId: string;
    } | null;
    readonly tracing?: {
      readonly status: "ok" | "warn" | "error";
      readonly traceId?: string | null;
    } | null;
    readonly metrics?: {
      readonly status: "ok" | "warn" | "error";
      readonly counter: string;
    } | null;
    readonly errors?: {
      readonly status: "ok" | "warn" | "error";
      readonly sentryEventId?: string | null;
      readonly reason?: "sentry-issue-reporter-disabled" | null;
      readonly message?: string | null;
    } | null;
  };
};
export const HealthGetObservabilityVerification200 = Schema.Struct({
  status: Schema.Literals(["ok", "warn", "error"]),
  timestamp: Schema.String,
  serviceId: Schema.String,
  level: Schema.Literals(["basic", "standard", "full"]),
  checks: Schema.Struct({
    logging: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({
          status: Schema.Literals(["ok", "warn", "error"]),
          correlationId: Schema.String,
        }),
        Schema.Null,
      ]),
    ),
    tracing: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({
          status: Schema.Literals(["ok", "warn", "error"]),
          traceId: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
        }),
        Schema.Null,
      ]),
    ),
    metrics: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({ status: Schema.Literals(["ok", "warn", "error"]), counter: Schema.String }),
        Schema.Null,
      ]),
    ),
    errors: Schema.optionalKey(
      Schema.Union([
        Schema.Struct({
          status: Schema.Literals(["ok", "warn", "error"]),
          sentryEventId: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
          reason: Schema.optionalKey(
            Schema.Union([Schema.Literal("sentry-issue-reporter-disabled"), Schema.Null]),
          ),
          message: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
        }),
        Schema.Null,
      ]),
    ),
  }),
});
export type HealthGetObservabilityVerification400 = DecodeErrorResponse;
export const HealthGetObservabilityVerification400 = DecodeErrorResponse;
export type SearchSearchExtensionsParams = {
  readonly q: string;
  readonly cursor?: string | null;
  readonly limit?: string | null;
};
export const SearchSearchExtensionsParams = Schema.Struct({
  q: Schema.String.annotate({
    description: "Search query string. Use an empty string to list the public catalog.",
    examples: ["git commit", ""],
  }),
  cursor: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Opaque cursor from a previous response for pagination.",
      }),
      Schema.Null,
    ]),
  ),
  limit: Schema.optionalKey(
    Schema.Union([
      Schema.String.annotate({
        description: "Maximum number of results to return (1–100, default 20).",
      }),
      Schema.Null,
    ]),
  ),
});
export type SearchSearchExtensions200 = SearchResponse;
export const SearchSearchExtensions200 = SearchResponse;
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
            "500": decodeError("AuthIssueDeviceCode500", AuthIssueDeviceCode500),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthExchangeToken: (options) =>
      HttpClientRequest.post(`/v1/auth/token`).pipe(
        HttpClientRequest.bodyUrlParams(options.payload as any),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(AuthExchangeToken200),
            "400": decodeError("AuthExchangeToken400", AuthExchangeToken400),
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
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthRevokeOAuthToken: (options) =>
      HttpClientRequest.post(`/v1/auth/revoke`).pipe(
        HttpClientRequest.bodyUrlParams(options.payload as any),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "400": decodeError("AuthRevokeOAuthToken400", AuthRevokeOAuthToken400),
            "200": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    AuthGetWhoami: (options) =>
      HttpClientRequest.get(`/v1/auth/whoami`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(AuthGetWhoami200),
            "400": decodeError("AuthGetWhoami400", AuthGetWhoami400),
            "401": decodeError("AuthGetWhoami401", AuthGetWhoami401),
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
    AuthGetStepUpChallenge: (challengeId, options) =>
      HttpClientRequest.get(`/v1/auth/step-up/challenges/${challengeId}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(AuthGetStepUpChallenge200),
            "400": decodeError("AuthGetStepUpChallenge400", AuthGetStepUpChallenge400),
            "401": decodeError("AuthGetStepUpChallenge401", AuthGetStepUpChallenge401),
            "404": decodeError("AuthGetStepUpChallenge404", AuthGetStepUpChallenge404),
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
    OwnersGetOwner: (handle, options) =>
      HttpClientRequest.get(`/v1/owners/${handle}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(OwnersGetOwner200),
            "400": decodeError("OwnersGetOwner400", OwnersGetOwner400),
            "404": decodeError("OwnersGetOwner404", OwnersGetOwner404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    OrgsTeamsListTeams: (handle, options) =>
      HttpClientRequest.get(`/v1/orgs/${handle}/teams`).pipe(
        HttpClientRequest.setUrlParams({
          cursor: options?.params?.["cursor"] as any,
          limit: options?.params?.["limit"] as any,
        }),
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(OrgsTeamsListTeams200),
            "400": decodeError("OrgsTeamsListTeams400", OrgsTeamsListTeams400),
            "401": decodeError("OrgsTeamsListTeams401", OrgsTeamsListTeams401),
            "404": decodeError("OrgsTeamsListTeams404", OrgsTeamsListTeams404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    OrgsTeamsCreateTeam: (handle, options) =>
      HttpClientRequest.post(`/v1/orgs/${handle}/teams`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(OrgsTeamsCreateTeam200),
            "400": decodeError("OrgsTeamsCreateTeam400", OrgsTeamsCreateTeam400),
            "401": decodeError("OrgsTeamsCreateTeam401", OrgsTeamsCreateTeam401),
            "403": decodeError("OrgsTeamsCreateTeam403", OrgsTeamsCreateTeam403),
            "404": decodeError("OrgsTeamsCreateTeam404", OrgsTeamsCreateTeam404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    OrgsTeamsGetTeam: (handle, teamId, options) =>
      HttpClientRequest.get(`/v1/orgs/${handle}/teams/${teamId}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(OrgsTeamsGetTeam200),
            "400": decodeError("OrgsTeamsGetTeam400", OrgsTeamsGetTeam400),
            "401": decodeError("OrgsTeamsGetTeam401", OrgsTeamsGetTeam401),
            "404": decodeError("OrgsTeamsGetTeam404", OrgsTeamsGetTeam404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    OrgsTeamsDeleteTeam: (handle, teamId, options) =>
      HttpClientRequest.delete(`/v1/orgs/${handle}/teams/${teamId}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "400": decodeError("OrgsTeamsDeleteTeam400", OrgsTeamsDeleteTeam400),
            "401": decodeError("OrgsTeamsDeleteTeam401", OrgsTeamsDeleteTeam401),
            "403": decodeError("OrgsTeamsDeleteTeam403", OrgsTeamsDeleteTeam403),
            "404": decodeError("OrgsTeamsDeleteTeam404", OrgsTeamsDeleteTeam404),
            "204": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    OrgsTeamsUpdateTeam: (handle, teamId, options) =>
      HttpClientRequest.patch(`/v1/orgs/${handle}/teams/${teamId}`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(OrgsTeamsUpdateTeam200),
            "400": decodeError("OrgsTeamsUpdateTeam400", OrgsTeamsUpdateTeam400),
            "401": decodeError("OrgsTeamsUpdateTeam401", OrgsTeamsUpdateTeam401),
            "403": decodeError("OrgsTeamsUpdateTeam403", OrgsTeamsUpdateTeam403),
            "404": decodeError("OrgsTeamsUpdateTeam404", OrgsTeamsUpdateTeam404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    OrgsTeamsListTeamMembers: (handle, teamId, options) =>
      HttpClientRequest.get(`/v1/orgs/${handle}/teams/${teamId}/members`).pipe(
        HttpClientRequest.setUrlParams({
          cursor: options?.params?.["cursor"] as any,
          limit: options?.params?.["limit"] as any,
        }),
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(OrgsTeamsListTeamMembers200),
            "400": decodeError("OrgsTeamsListTeamMembers400", OrgsTeamsListTeamMembers400),
            "401": decodeError("OrgsTeamsListTeamMembers401", OrgsTeamsListTeamMembers401),
            "404": decodeError("OrgsTeamsListTeamMembers404", OrgsTeamsListTeamMembers404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    OrgsTeamsAddTeamMember: (handle, teamId, options) =>
      HttpClientRequest.post(`/v1/orgs/${handle}/teams/${teamId}/members`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(OrgsTeamsAddTeamMember200),
            "400": decodeError("OrgsTeamsAddTeamMember400", OrgsTeamsAddTeamMember400),
            "401": decodeError("OrgsTeamsAddTeamMember401", OrgsTeamsAddTeamMember401),
            "403": decodeError("OrgsTeamsAddTeamMember403", OrgsTeamsAddTeamMember403),
            "404": decodeError("OrgsTeamsAddTeamMember404", OrgsTeamsAddTeamMember404),
            "422": decodeError("OrgsTeamsAddTeamMember422", OrgsTeamsAddTeamMember422),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    OrgsTeamsRemoveTeamMember: (handle, teamId, userId, options) =>
      HttpClientRequest.delete(`/v1/orgs/${handle}/teams/${teamId}/members/${userId}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "400": decodeError("OrgsTeamsRemoveTeamMember400", OrgsTeamsRemoveTeamMember400),
            "401": decodeError("OrgsTeamsRemoveTeamMember401", OrgsTeamsRemoveTeamMember401),
            "403": decodeError("OrgsTeamsRemoveTeamMember403", OrgsTeamsRemoveTeamMember403),
            "404": decodeError("OrgsTeamsRemoveTeamMember404", OrgsTeamsRemoveTeamMember404),
            "204": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    OrgsTeamsChangeTeamMemberRole: (handle, teamId, userId, options) =>
      HttpClientRequest.patch(`/v1/orgs/${handle}/teams/${teamId}/members/${userId}`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(OrgsTeamsChangeTeamMemberRole200),
            "400": decodeError(
              "OrgsTeamsChangeTeamMemberRole400",
              OrgsTeamsChangeTeamMemberRole400,
            ),
            "401": decodeError(
              "OrgsTeamsChangeTeamMemberRole401",
              OrgsTeamsChangeTeamMemberRole401,
            ),
            "403": decodeError(
              "OrgsTeamsChangeTeamMemberRole403",
              OrgsTeamsChangeTeamMemberRole403,
            ),
            "404": decodeError(
              "OrgsTeamsChangeTeamMemberRole404",
              OrgsTeamsChangeTeamMemberRole404,
            ),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ListsListLists: (owner, options) =>
      HttpClientRequest.get(`/v1/lists/${owner}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ListsListLists200),
            "400": decodeError("ListsListLists400", ListsListLists400),
            "404": decodeError("ListsListLists404", ListsListLists404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ListsCreateList: (owner, options) =>
      HttpClientRequest.post(`/v1/lists/${owner}`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ListsCreateList200),
            "400": decodeError("ListsCreateList400", ListsCreateList400),
            "401": decodeError("ListsCreateList401", ListsCreateList401),
            "403": decodeError("ListsCreateList403", ListsCreateList403),
            "404": decodeError("ListsCreateList404", ListsCreateList404),
            "409": decodeError("ListsCreateList409", ListsCreateList409),
            "422": decodeError("ListsCreateList422", ListsCreateList422),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ListsGetList: (owner, name, options) =>
      HttpClientRequest.get(`/v1/lists/${owner}/${name}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ListsGetList200),
            "400": decodeError("ListsGetList400", ListsGetList400),
            "404": decodeError("ListsGetList404", ListsGetList404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ListsDeleteList: (owner, name, options) =>
      HttpClientRequest.delete(`/v1/lists/${owner}/${name}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "400": decodeError("ListsDeleteList400", ListsDeleteList400),
            "401": decodeError("ListsDeleteList401", ListsDeleteList401),
            "403": decodeError("ListsDeleteList403", ListsDeleteList403),
            "404": decodeError("ListsDeleteList404", ListsDeleteList404),
            "204": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ListsUpdateList: (owner, name, options) =>
      HttpClientRequest.patch(`/v1/lists/${owner}/${name}`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ListsUpdateList200),
            "400": decodeError("ListsUpdateList400", ListsUpdateList400),
            "401": decodeError("ListsUpdateList401", ListsUpdateList401),
            "403": decodeError("ListsUpdateList403", ListsUpdateList403),
            "404": decodeError("ListsUpdateList404", ListsUpdateList404),
            "409": decodeError("ListsUpdateList409", ListsUpdateList409),
            "422": decodeError("ListsUpdateList422", ListsUpdateList422),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ListsAddListItem: (owner, name, options) =>
      HttpClientRequest.post(`/v1/lists/${owner}/${name}/items`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ListsAddListItem200),
            "400": decodeError("ListsAddListItem400", ListsAddListItem400),
            "401": decodeError("ListsAddListItem401", ListsAddListItem401),
            "403": decodeError("ListsAddListItem403", ListsAddListItem403),
            "404": decodeError("ListsAddListItem404", ListsAddListItem404),
            "409": decodeError("ListsAddListItem409", ListsAddListItem409),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ListsRemoveListItem: (owner, name, type, extensionName, options) =>
      HttpClientRequest.delete(`/v1/lists/${owner}/${name}/items/${type}/${extensionName}`).pipe(
        HttpClientRequest.setUrlParams({
          extensionOwner: options?.params?.["extensionOwner"] as any,
        }),
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "400": decodeError("ListsRemoveListItem400", ListsRemoveListItem400),
            "401": decodeError("ListsRemoveListItem401", ListsRemoveListItem401),
            "403": decodeError("ListsRemoveListItem403", ListsRemoveListItem403),
            "404": decodeError("ListsRemoveListItem404", ListsRemoveListItem404),
            "204": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsListByOwner: (owner, options) =>
      HttpClientRequest.get(`/v1/extensions/${owner}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsListByOwner200),
            "400": decodeError("ExtensionsListByOwner400", ExtensionsListByOwner400),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsListByType: (owner, type, options) =>
      HttpClientRequest.get(`/v1/extensions/${owner}/${type}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsListByType200),
            "400": decodeError("ExtensionsListByType400", ExtensionsListByType400),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsGet: (owner, type, name, options) =>
      HttpClientRequest.get(`/v1/extensions/${owner}/${type}/${name}`).pipe(
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
    ExtensionsHead: (owner, type, name, options) =>
      HttpClientRequest.head(`/v1/extensions/${owner}/${type}/${name}`).pipe(
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
    ExtensionsUpdateVisibility: (owner, type, name, options) =>
      HttpClientRequest.patch(`/v1/extensions/${owner}/${type}/${name}`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsUpdateVisibility200),
            "400": decodeError("ExtensionsUpdateVisibility400", ExtensionsUpdateVisibility400),
            "401": decodeError("ExtensionsUpdateVisibility401", ExtensionsUpdateVisibility401),
            "403": decodeError("ExtensionsUpdateVisibility403", ExtensionsUpdateVisibility403),
            "404": decodeError("ExtensionsUpdateVisibility404", ExtensionsUpdateVisibility404),
            "422": decodeError("ExtensionsUpdateVisibility422", ExtensionsUpdateVisibility422),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsGetVersion: (owner, type, name, version, options) =>
      HttpClientRequest.get(`/v1/extensions/${owner}/${type}/${name}/${version}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsGetVersion200),
            "400": decodeError("ExtensionsGetVersion400", ExtensionsGetVersion400),
            "404": decodeError("ExtensionsGetVersion404", ExtensionsGetVersion404),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsPublishVersion: (owner, type, name, version, options) =>
      HttpClientRequest.put(`/v1/extensions/${owner}/${type}/${name}/${version}`).pipe(
        HttpClientRequest.bodyFormData(options.payload as any),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(ExtensionsPublishVersion201),
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
            "503": decodeError("ExtensionsPublishVersion503", ExtensionsPublishVersion503),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    ExtensionsDeleteVersion: (owner, type, name, version, options) =>
      HttpClientRequest.delete(`/v1/extensions/${owner}/${type}/${name}/${version}`).pipe(
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
    ExtensionsDownloadArchive: (owner, type, name, version, options) =>
      HttpClientRequest.get(`/v1/extensions/${owner}/${type}/${name}/${version}/archive`).pipe(
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
    ExtensionsDownloadArchiveStream: (owner, type, name, version) =>
      HttpClientRequest.get(`/v1/extensions/${owner}/${type}/${name}/${version}/archive`).pipe(
        binaryRequest,
      ),
    ExtensionsDeprecate: (owner, type, name, options) =>
      HttpClientRequest.post(`/v1/extensions/${owner}/${type}/${name}/deprecate`).pipe(
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
    ExtensionsUndeprecate: (owner, type, name, options) =>
      HttpClientRequest.delete(`/v1/extensions/${owner}/${type}/${name}/deprecate`).pipe(
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
    ExtensionsYankVersion: (owner, type, name, version, options) =>
      HttpClientRequest.post(`/v1/extensions/${owner}/${type}/${name}/${version}/yank`).pipe(
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
    ExtensionsUnyankVersion: (owner, type, name, version, options) =>
      HttpClientRequest.delete(`/v1/extensions/${owner}/${type}/${name}/${version}/yank`).pipe(
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
    CollaboratorsListCollaborators: (owner, type, name, options) =>
      HttpClientRequest.get(`/v1/extensions/${owner}/${type}/${name}/collaborators`).pipe(
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
    CollaboratorsUpsertCollaborator: (owner, type, name, userId, options) =>
      HttpClientRequest.put(`/v1/extensions/${owner}/${type}/${name}/collaborators/${userId}`).pipe(
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
    CollaboratorsDeleteCollaborator: (owner, type, name, userId, options) =>
      HttpClientRequest.delete(
        `/v1/extensions/${owner}/${type}/${name}/collaborators/${userId}`,
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
    TeamGrantsUpsertTeamExtensionGrant: (owner, type, name, options) =>
      HttpClientRequest.post(`/v1/extensions/${owner}/${type}/${name}/grants`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(TeamGrantsUpsertTeamExtensionGrant200),
            "400": decodeError(
              "TeamGrantsUpsertTeamExtensionGrant400",
              TeamGrantsUpsertTeamExtensionGrant400,
            ),
            "401": decodeError(
              "TeamGrantsUpsertTeamExtensionGrant401",
              TeamGrantsUpsertTeamExtensionGrant401,
            ),
            "403": decodeError(
              "TeamGrantsUpsertTeamExtensionGrant403",
              TeamGrantsUpsertTeamExtensionGrant403,
            ),
            "404": decodeError(
              "TeamGrantsUpsertTeamExtensionGrant404",
              TeamGrantsUpsertTeamExtensionGrant404,
            ),
            "422": decodeError(
              "TeamGrantsUpsertTeamExtensionGrant422",
              TeamGrantsUpsertTeamExtensionGrant422,
            ),
            orElse: unexpectedStatus,
          }),
        ),
      ),
    TeamGrantsDeleteTeamExtensionGrant: (owner, type, name, teamId, options) =>
      HttpClientRequest.delete(`/v1/extensions/${owner}/${type}/${name}/grants/${teamId}`).pipe(
        withResponse(options?.config)(
          HttpClientResponse.matchStatus({
            "400": decodeError(
              "TeamGrantsDeleteTeamExtensionGrant400",
              TeamGrantsDeleteTeamExtensionGrant400,
            ),
            "401": decodeError(
              "TeamGrantsDeleteTeamExtensionGrant401",
              TeamGrantsDeleteTeamExtensionGrant401,
            ),
            "403": decodeError(
              "TeamGrantsDeleteTeamExtensionGrant403",
              TeamGrantsDeleteTeamExtensionGrant403,
            ),
            "404": decodeError(
              "TeamGrantsDeleteTeamExtensionGrant404",
              TeamGrantsDeleteTeamExtensionGrant404,
            ),
            "204": () => Effect.void,
            orElse: unexpectedStatus,
          }),
        ),
      ),
    DiscoveryPostDiscovery: (options) =>
      HttpClientRequest.post(`/v1/discovery`).pipe(
        HttpClientRequest.bodyJsonUnsafe(options.payload),
        withResponse(options.config)(
          HttpClientResponse.matchStatus({
            "2xx": decodeSuccess(DiscoveryPostDiscovery200),
            "400": decodeError("DiscoveryPostDiscovery400", DiscoveryPostDiscovery400),
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
        HttpClientRequest.setUrlParams({
          level: options?.params?.["level"] as any,
          scenario: options?.params?.["scenario"] as any,
          scenarioId: options?.params?.["scenarioId"] as any,
        }),
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
        HttpClientRequest.setUrlParams({
          q: options.params["q"] as any,
          cursor: options.params["cursor"] as any,
          limit: options.params["limit"] as any,
        }),
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
    | RegistryClientError<"AuthIssueDeviceCode500", typeof AuthIssueDeviceCode500.Type>
  >;
  /**
   * Exchange OAuth grant for access token
   */
  readonly AuthExchangeToken: <Config extends OperationConfig>(options: {
    readonly payload: typeof AuthExchangeTokenRequestFormUrlEncoded.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<typeof AuthExchangeToken200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthExchangeToken400", typeof AuthExchangeToken400.Type>
  >;
  /**
   * Deprecated: exchange refresh token
   */
  readonly AuthRefreshToken: <Config extends OperationConfig>(options: {
    readonly payload: typeof AuthRefreshTokenRequestFormUrlEncoded.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<typeof AuthRefreshToken200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthRefreshToken400", typeof AuthRefreshToken400.Type>
  >;
  /**
   * Revoke an OAuth token (RFC 7009)
   */
  readonly AuthRevokeOAuthToken: <Config extends OperationConfig>(options: {
    readonly payload: typeof AuthRevokeOAuthTokenRequestFormUrlEncoded.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthRevokeOAuthToken400", typeof AuthRevokeOAuthToken400.Type>
  >;
  /**
   * Return authenticated user handle
   */
  readonly AuthGetWhoami: <Config extends OperationConfig>(
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof AuthGetWhoami200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthGetWhoami400", typeof AuthGetWhoami400.Type>
    | RegistryClientError<"AuthGetWhoami401", typeof AuthGetWhoami401.Type>
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
   * Poll step-up challenge status
   */
  readonly AuthGetStepUpChallenge: <Config extends OperationConfig>(
    challengeId: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof AuthGetStepUpChallenge200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"AuthGetStepUpChallenge400", typeof AuthGetStepUpChallenge400.Type>
    | RegistryClientError<"AuthGetStepUpChallenge401", typeof AuthGetStepUpChallenge401.Type>
    | RegistryClientError<"AuthGetStepUpChallenge404", typeof AuthGetStepUpChallenge404.Type>
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
   * Revokes the access token identified by tokenId.
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
   * Returns the minimal public owner summary for the provided handle.
   */
  readonly OwnersGetOwner: <Config extends OperationConfig>(
    handle: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof OwnersGetOwner200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"OwnersGetOwner400", typeof OwnersGetOwner400.Type>
    | RegistryClientError<"OwnersGetOwner404", typeof OwnersGetOwner404.Type>
  >;
  /**
   * Paginated list of teams. Non-members of the organization receive 404 (hidden existence).
   */
  readonly OrgsTeamsListTeams: <Config extends OperationConfig>(
    handle: string,
    options:
      | {
          readonly params?: typeof OrgsTeamsListTeamsParams.Encoded | undefined;
          readonly config?: Config | undefined;
        }
      | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof OrgsTeamsListTeams200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"OrgsTeamsListTeams400", typeof OrgsTeamsListTeams400.Type>
    | RegistryClientError<"OrgsTeamsListTeams401", typeof OrgsTeamsListTeams401.Type>
    | RegistryClientError<"OrgsTeamsListTeams404", typeof OrgsTeamsListTeams404.Type>
  >;
  /**
   * Creates a new team in the organization. Only organization owners and admins may create teams.
   */
  readonly OrgsTeamsCreateTeam: <Config extends OperationConfig>(
    handle: string,
    options: {
      readonly payload: typeof OrgsTeamsCreateTeamRequestJson.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof OrgsTeamsCreateTeam200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"OrgsTeamsCreateTeam400", typeof OrgsTeamsCreateTeam400.Type>
    | RegistryClientError<"OrgsTeamsCreateTeam401", typeof OrgsTeamsCreateTeam401.Type>
    | RegistryClientError<"OrgsTeamsCreateTeam403", typeof OrgsTeamsCreateTeam403.Type>
    | RegistryClientError<"OrgsTeamsCreateTeam404", typeof OrgsTeamsCreateTeam404.Type>
  >;
  /**
   * Returns the team when the caller is an organization member or a team member. Non-visible teams surface as 404 (hidden existence).
   */
  readonly OrgsTeamsGetTeam: <Config extends OperationConfig>(
    handle: string,
    teamId: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof OrgsTeamsGetTeam200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"OrgsTeamsGetTeam400", typeof OrgsTeamsGetTeam400.Type>
    | RegistryClientError<"OrgsTeamsGetTeam401", typeof OrgsTeamsGetTeam401.Type>
    | RegistryClientError<"OrgsTeamsGetTeam404", typeof OrgsTeamsGetTeam404.Type>
  >;
  /**
   * Deletes a team. Memberships and team extension grants cascade. Only organization owners and admins may delete teams.
   */
  readonly OrgsTeamsDeleteTeam: <Config extends OperationConfig>(
    handle: string,
    teamId: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"OrgsTeamsDeleteTeam400", typeof OrgsTeamsDeleteTeam400.Type>
    | RegistryClientError<"OrgsTeamsDeleteTeam401", typeof OrgsTeamsDeleteTeam401.Type>
    | RegistryClientError<"OrgsTeamsDeleteTeam403", typeof OrgsTeamsDeleteTeam403.Type>
    | RegistryClientError<"OrgsTeamsDeleteTeam404", typeof OrgsTeamsDeleteTeam404.Type>
  >;
  /**
   * Partial update to a team's displayName and/or description. Only organization owners and admins may update teams.
   */
  readonly OrgsTeamsUpdateTeam: <Config extends OperationConfig>(
    handle: string,
    teamId: string,
    options: {
      readonly payload: typeof OrgsTeamsUpdateTeamRequestJson.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof OrgsTeamsUpdateTeam200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"OrgsTeamsUpdateTeam400", typeof OrgsTeamsUpdateTeam400.Type>
    | RegistryClientError<"OrgsTeamsUpdateTeam401", typeof OrgsTeamsUpdateTeam401.Type>
    | RegistryClientError<"OrgsTeamsUpdateTeam403", typeof OrgsTeamsUpdateTeam403.Type>
    | RegistryClientError<"OrgsTeamsUpdateTeam404", typeof OrgsTeamsUpdateTeam404.Type>
  >;
  /**
   * Paginated list of team members. Non-visible teams surface as 404 (hidden existence).
   */
  readonly OrgsTeamsListTeamMembers: <Config extends OperationConfig>(
    handle: string,
    teamId: string,
    options:
      | {
          readonly params?: typeof OrgsTeamsListTeamMembersParams.Encoded | undefined;
          readonly config?: Config | undefined;
        }
      | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof OrgsTeamsListTeamMembers200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"OrgsTeamsListTeamMembers400", typeof OrgsTeamsListTeamMembers400.Type>
    | RegistryClientError<"OrgsTeamsListTeamMembers401", typeof OrgsTeamsListTeamMembers401.Type>
    | RegistryClientError<"OrgsTeamsListTeamMembers404", typeof OrgsTeamsListTeamMembers404.Type>
  >;
  /**
   * Adds a user to a team. Target user must already belong to the team's organization; otherwise returns 422. Only team admins or organization owners/admins may add members.
   */
  readonly OrgsTeamsAddTeamMember: <Config extends OperationConfig>(
    handle: string,
    teamId: string,
    options: {
      readonly payload: typeof OrgsTeamsAddTeamMemberRequestJson.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof OrgsTeamsAddTeamMember200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"OrgsTeamsAddTeamMember400", typeof OrgsTeamsAddTeamMember400.Type>
    | RegistryClientError<"OrgsTeamsAddTeamMember401", typeof OrgsTeamsAddTeamMember401.Type>
    | RegistryClientError<"OrgsTeamsAddTeamMember403", typeof OrgsTeamsAddTeamMember403.Type>
    | RegistryClientError<"OrgsTeamsAddTeamMember404", typeof OrgsTeamsAddTeamMember404.Type>
    | RegistryClientError<"OrgsTeamsAddTeamMember422", typeof OrgsTeamsAddTeamMember422.Type>
  >;
  /**
   * Removes a user from a team. Only team admins or organization owners/admins may remove members.
   */
  readonly OrgsTeamsRemoveTeamMember: <Config extends OperationConfig>(
    handle: string,
    teamId: string,
    userId: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"OrgsTeamsRemoveTeamMember400", typeof OrgsTeamsRemoveTeamMember400.Type>
    | RegistryClientError<"OrgsTeamsRemoveTeamMember401", typeof OrgsTeamsRemoveTeamMember401.Type>
    | RegistryClientError<"OrgsTeamsRemoveTeamMember403", typeof OrgsTeamsRemoveTeamMember403.Type>
    | RegistryClientError<"OrgsTeamsRemoveTeamMember404", typeof OrgsTeamsRemoveTeamMember404.Type>
  >;
  /**
   * Updates a team member's role. Only team admins or organization owners/admins may change roles.
   */
  readonly OrgsTeamsChangeTeamMemberRole: <Config extends OperationConfig>(
    handle: string,
    teamId: string,
    userId: string,
    options: {
      readonly payload: typeof OrgsTeamsChangeTeamMemberRoleRequestJson.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof OrgsTeamsChangeTeamMemberRole200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<
        "OrgsTeamsChangeTeamMemberRole400",
        typeof OrgsTeamsChangeTeamMemberRole400.Type
      >
    | RegistryClientError<
        "OrgsTeamsChangeTeamMemberRole401",
        typeof OrgsTeamsChangeTeamMemberRole401.Type
      >
    | RegistryClientError<
        "OrgsTeamsChangeTeamMemberRole403",
        typeof OrgsTeamsChangeTeamMemberRole403.Type
      >
    | RegistryClientError<
        "OrgsTeamsChangeTeamMemberRole404",
        typeof OrgsTeamsChangeTeamMemberRole404.Type
      >
  >;
  /**
   * Returns the public listed lists for an owner, widened by caller visibility when authenticated.
   */
  readonly ListsListLists: <Config extends OperationConfig>(
    owner: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ListsListLists200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ListsListLists400", typeof ListsListLists400.Type>
    | RegistryClientError<"ListsListLists404", typeof ListsListLists404.Type>
  >;
  /**
   * Creates a list under a user or organization handle.
   */
  readonly ListsCreateList: <Config extends OperationConfig>(
    owner: string,
    options: {
      readonly payload: typeof ListsCreateListRequestJson.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof ListsCreateList200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ListsCreateList400", typeof ListsCreateList400.Type>
    | RegistryClientError<"ListsCreateList401", typeof ListsCreateList401.Type>
    | RegistryClientError<"ListsCreateList403", typeof ListsCreateList403.Type>
    | RegistryClientError<"ListsCreateList404", typeof ListsCreateList404.Type>
    | RegistryClientError<"ListsCreateList409", typeof ListsCreateList409.Type>
    | RegistryClientError<"ListsCreateList422", typeof ListsCreateList422.Type>
  >;
  /**
   * Returns a list and its items. Items are filtered by extension visibility for the caller.
   */
  readonly ListsGetList: <Config extends OperationConfig>(
    owner: string,
    name: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ListsGetList200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ListsGetList400", typeof ListsGetList400.Type>
    | RegistryClientError<"ListsGetList404", typeof ListsGetList404.Type>
  >;
  /**
   * Deletes a list and its items.
   */
  readonly ListsDeleteList: <Config extends OperationConfig>(
    owner: string,
    name: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ListsDeleteList400", typeof ListsDeleteList400.Type>
    | RegistryClientError<"ListsDeleteList401", typeof ListsDeleteList401.Type>
    | RegistryClientError<"ListsDeleteList403", typeof ListsDeleteList403.Type>
    | RegistryClientError<"ListsDeleteList404", typeof ListsDeleteList404.Type>
  >;
  /**
   * Updates list metadata, visibility, listed state, or name.
   */
  readonly ListsUpdateList: <Config extends OperationConfig>(
    owner: string,
    name: string,
    options: {
      readonly payload: typeof ListsUpdateListRequestJson.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof ListsUpdateList200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ListsUpdateList400", typeof ListsUpdateList400.Type>
    | RegistryClientError<"ListsUpdateList401", typeof ListsUpdateList401.Type>
    | RegistryClientError<"ListsUpdateList403", typeof ListsUpdateList403.Type>
    | RegistryClientError<"ListsUpdateList404", typeof ListsUpdateList404.Type>
    | RegistryClientError<"ListsUpdateList409", typeof ListsUpdateList409.Type>
    | RegistryClientError<"ListsUpdateList422", typeof ListsUpdateList422.Type>
  >;
  /**
   * Adds an extension reference to a list with an optional curator note.
   */
  readonly ListsAddListItem: <Config extends OperationConfig>(
    owner: string,
    name: string,
    options: {
      readonly payload: typeof ListsAddListItemRequestJson.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof ListsAddListItem200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ListsAddListItem400", typeof ListsAddListItem400.Type>
    | RegistryClientError<"ListsAddListItem401", typeof ListsAddListItem401.Type>
    | RegistryClientError<"ListsAddListItem403", typeof ListsAddListItem403.Type>
    | RegistryClientError<"ListsAddListItem404", typeof ListsAddListItem404.Type>
    | RegistryClientError<"ListsAddListItem409", typeof ListsAddListItem409.Type>
  >;
  /**
   * Removes an extension reference from a list. When extensionOwner is omitted, the list owner is used.
   */
  readonly ListsRemoveListItem: <Config extends OperationConfig>(
    owner: string,
    name: string,
    type: string,
    extensionName: string,
    options:
      | {
          readonly params?: typeof ListsRemoveListItemParams.Encoded | undefined;
          readonly config?: Config | undefined;
        }
      | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ListsRemoveListItem400", typeof ListsRemoveListItem400.Type>
    | RegistryClientError<"ListsRemoveListItem401", typeof ListsRemoveListItem401.Type>
    | RegistryClientError<"ListsRemoveListItem403", typeof ListsRemoveListItem403.Type>
    | RegistryClientError<"ListsRemoveListItem404", typeof ListsRemoveListItem404.Type>
  >;
  /**
   * List owner extensions
   */
  readonly ExtensionsListByOwner: <Config extends OperationConfig>(
    owner: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsListByOwner200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"ExtensionsListByOwner400", typeof ExtensionsListByOwner400.Type>
  >;
  /**
   * List owner extensions by type
   */
  readonly ExtensionsListByType: <Config extends OperationConfig>(
    owner: string,
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
    owner: string,
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
    owner: string,
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
   * Update extension visibility and/or listed flag
   */
  readonly ExtensionsUpdateVisibility: <Config extends OperationConfig>(
    owner: string,
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
    | RegistryClientError<
        "ExtensionsUpdateVisibility422",
        typeof ExtensionsUpdateVisibility422.Type
      >
  >;
  /**
   * Get extension version metadata
   */
  readonly ExtensionsGetVersion: <Config extends OperationConfig>(
    owner: string,
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
    owner: string,
    type: string,
    name: string,
    version: string,
    options: {
      readonly payload: typeof ExtensionsPublishVersionRequestFormData.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof ExtensionsPublishVersion201.Type, Config>,
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
    | RegistryClientError<"ExtensionsPublishVersion503", typeof ExtensionsPublishVersion503.Type>
  >;
  /**
   * Hard-delete an extension version
   */
  readonly ExtensionsDeleteVersion: <Config extends OperationConfig>(
    owner: string,
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
    owner: string,
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
    owner: string,
    type: string,
    name: string,
    version: string,
  ) => Stream.Stream<Uint8Array, HttpClientError.HttpClientError>;
  /**
   * Deprecate an extension
   */
  readonly ExtensionsDeprecate: <Config extends OperationConfig>(
    owner: string,
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
    owner: string,
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
    owner: string,
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
    owner: string,
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
    owner: string,
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
   * Adds or updates the collaborator identified by userId on the extension.
   */
  readonly CollaboratorsUpsertCollaborator: <Config extends OperationConfig>(
    owner: string,
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
   * Removes the collaborator identified by userId from the extension.
   */
  readonly CollaboratorsDeleteCollaborator: <Config extends OperationConfig>(
    owner: string,
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
   * Creates or updates a grant of a team's access to this extension. The team must belong to the same organization that owns the extension (otherwise 422). Only team admins or organization owners/admins may grant.
   */
  readonly TeamGrantsUpsertTeamExtensionGrant: <Config extends OperationConfig>(
    owner: string,
    type: string,
    name: string,
    options: {
      readonly payload: typeof TeamGrantsUpsertTeamExtensionGrantRequestJson.Encoded;
      readonly config?: Config | undefined;
    },
  ) => Effect.Effect<
    WithOptionalResponse<typeof TeamGrantsUpsertTeamExtensionGrant200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<
        "TeamGrantsUpsertTeamExtensionGrant400",
        typeof TeamGrantsUpsertTeamExtensionGrant400.Type
      >
    | RegistryClientError<
        "TeamGrantsUpsertTeamExtensionGrant401",
        typeof TeamGrantsUpsertTeamExtensionGrant401.Type
      >
    | RegistryClientError<
        "TeamGrantsUpsertTeamExtensionGrant403",
        typeof TeamGrantsUpsertTeamExtensionGrant403.Type
      >
    | RegistryClientError<
        "TeamGrantsUpsertTeamExtensionGrant404",
        typeof TeamGrantsUpsertTeamExtensionGrant404.Type
      >
    | RegistryClientError<
        "TeamGrantsUpsertTeamExtensionGrant422",
        typeof TeamGrantsUpsertTeamExtensionGrant422.Type
      >
  >;
  /**
   * Removes a team's grant on this extension. Idempotent — deleting a non-existent grant still returns 204.
   */
  readonly TeamGrantsDeleteTeamExtensionGrant: <Config extends OperationConfig>(
    owner: string,
    type: string,
    name: string,
    teamId: string,
    options: { readonly config?: Config | undefined } | undefined,
  ) => Effect.Effect<
    WithOptionalResponse<void, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<
        "TeamGrantsDeleteTeamExtensionGrant400",
        typeof TeamGrantsDeleteTeamExtensionGrant400.Type
      >
    | RegistryClientError<
        "TeamGrantsDeleteTeamExtensionGrant401",
        typeof TeamGrantsDeleteTeamExtensionGrant401.Type
      >
    | RegistryClientError<
        "TeamGrantsDeleteTeamExtensionGrant403",
        typeof TeamGrantsDeleteTeamExtensionGrant403.Type
      >
    | RegistryClientError<
        "TeamGrantsDeleteTeamExtensionGrant404",
        typeof TeamGrantsDeleteTeamExtensionGrant404.Type
      >
  >;
  /**
   * Persists submitted package metadata and resolves package and extension attestations.
   */
  readonly DiscoveryPostDiscovery: <Config extends OperationConfig>(options: {
    readonly payload: typeof DiscoveryPostDiscoveryRequestJson.Encoded;
    readonly config?: Config | undefined;
  }) => Effect.Effect<
    WithOptionalResponse<typeof DiscoveryPostDiscovery200.Type, Config>,
    | HttpClientError.HttpClientError
    | SchemaError
    | RegistryClientError<"DiscoveryPostDiscovery400", typeof DiscoveryPostDiscovery400.Type>
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
   * Exercises observability pipelines and can simulate server error scenarios. Requires X-Health-Key header.
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
   * Returns extensions whose name matches the query, ordered by most recently published version. When `q` is empty, returns the public catalog. Only public, available, non-yanked versions are returned.
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
