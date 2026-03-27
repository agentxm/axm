/**
 * Remote HTTPS registry client.
 *
 * Implements `publishExtension` via multipart PUT to the remote registry API.
 * All read operations fail with "remote registry not yet supported" error.
 * Includes RFC 7807 problem detail error mapping for publish responses.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { type AppError, makeAppError } from "../app-error/index.js";
import { isLoopbackAddress } from "../utils/index.js";
import type {
  ExtensionExistsArgs,
  ExtensionExistsResponse,
  GetExtensionIndexArgs,
  GetExtensionsByProfileArgs,
  GetExtensionsByProfileResponse,
  PublishExtensionArgs,
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionPackageArgs,
  GetExtensionPackageResponse,
  ProfileExistsResponse,
} from "./client.js";
import { ExtensionTypeSchema, toAuthor, type ExtensionType } from "../extensions/index.js";
import { ExtensionIndexSchema } from "./schema.js";
import { pluralizeType, resolveVersionEntry } from "./utils.js";

// -----------------------------------------------------------------------------
// RFC 7807 Problem Detail → AppError Mapping
// -----------------------------------------------------------------------------

/**
 * Maps an HTTP status code and parsed RFC 7807 problem detail JSON to a `AppError`.
 *
 * Handles all backend error codes from the remote registry publish API.
 * When the problem detail is null/undefined (non-JSON response), falls back
 * to a generic `REGISTRY_PUBLISH_FAILED` error.
 */
export const mapProblemDetailToAppError = (status: number, problem: unknown): AppError => {
  const detail = getStringField(problem, "detail");
  const requestId = getStringField(problem, "requestId");
  const validationIssueDetails = getValidationIssueDetails(problem);
  const code = getStringField(problem, "code");
  const details = buildDetails(detail, requestId, validationIssueDetails);

  if (code !== undefined) {
    // 409 publish_conflict
    if (status === 409 && code === "publish_conflict") {
      return makeAppError({
        code: "REGISTRY_PUBLISH_CONFLICT",
        what: "Version already exists with different content",
        details,
        howToFix:
          "This version already exists with different content. Bump the version in your manifest.",
      });
    }

    // 400 malformed_archive / empty_archive
    if (status === 400 && (code === "malformed_archive" || code === "empty_archive")) {
      return makeAppError({
        code: "REGISTRY_PUBLISH_INVALID_ARCHIVE",
        what: "Invalid extension archive",
        details,
        howToFix: "Check the extension directory and rebuild",
      });
    }

    // 413 ingest_*_too_large
    if (status === 413 && code.startsWith("ingest_") && code.endsWith("_too_large")) {
      return makeAppError({
        code: "REGISTRY_PUBLISH_TOO_LARGE",
        what: "Extension archive exceeds size limit",
        details,
        howToFix: "Reduce archive size or remove unnecessary files",
      });
    }

    // 415 ingest_unsupported_content_type
    if (status === 415 && code === "ingest_unsupported_content_type") {
      return makeAppError({
        code: "REGISTRY_PUBLISH_INVALID_ARCHIVE",
        what: "Unsupported archive content type",
        details,
      });
    }

    // 422 integrity_mismatch (check before manifest_* since both are 422)
    if (status === 422 && code === "integrity_mismatch") {
      return makeAppError({
        code: "REGISTRY_PUBLISH_INTEGRITY_MISMATCH",
        what: "Archive integrity does not match",
        details,
      });
    }

    // 422 manifest_*
    if (status === 422 && code.startsWith("manifest_")) {
      return makeAppError({
        code: "REGISTRY_PUBLISH_MANIFEST_INVALID",
        what: "Extension manifest validation failed",
        details,
        howToFix: "Check your extension manifest",
      });
    }

    // 429 throttled
    if (status === 429 && code === "throttled") {
      const retryAfter = getNumberField(problem, "retryAfterSeconds");
      const retryMsg =
        retryAfter !== undefined
          ? `Rate limited. Retry after ${retryAfter} seconds.`
          : "Rate limited. Try again later.";
      return makeAppError({
        code: "REGISTRY_PUBLISH_THROTTLED",
        what: "Publish request was rate limited",
        details,
        howToFix: retryMsg,
      });
    }

    // 403 quota_exceeded
    if (status === 403 && code === "quota_exceeded") {
      return makeAppError({
        code: "REGISTRY_PUBLISH_QUOTA_EXCEEDED",
        what: "Storage quota exceeded",
        details,
        howToFix: "Storage quota exceeded for this extension",
      });
    }

    // 501 publish_type_not_implemented
    if (status === 501 && code === "publish_type_not_implemented") {
      return makeAppError({
        code: "REGISTRY_PUBLISH_TYPE_NOT_SUPPORTED",
        what: "Extension type is not supported for publishing",
        details,
      });
    }

    // 503 publish_disabled
    if (status === 503 && code === "publish_disabled") {
      return makeAppError({
        code: "REGISTRY_PUBLISH_DISABLED",
        what: "Publishing is temporarily disabled",
        details,
        howToFix: "Publishing is temporarily disabled. Try again later.",
      });
    }
  }

  // Fallback: unexpected status or unrecognized code
  return makeAppError({
    code: "REGISTRY_PUBLISH_FAILED",
    what: `Publish failed with status ${String(status)}`,
    details,
  });
};

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

/**
 * Safely extract a field from an unknown object, returning undefined when the
 * object is not a plain record or the field is absent / has the wrong type.
 */
const getField = <T>(obj: unknown, field: string, guard: (v: unknown) => v is T): T | undefined => {
  if (obj !== null && obj !== undefined && typeof obj === "object") {
    const value = Reflect.get(obj, field);
    return guard(value) ? value : undefined;
  }
  return undefined;
};

const isString = (v: unknown): v is string => typeof v === "string";
const isNumber = (v: unknown): v is number => typeof v === "number";
const isArray = (v: unknown): v is ReadonlyArray<unknown> => Array.isArray(v);

const getStringField = (obj: unknown, field: string): string | undefined =>
  getField(obj, field, isString);

const getNumberField = (obj: unknown, field: string): number | undefined =>
  getField(obj, field, isNumber);

const getArrayField = (obj: unknown, field: string): ReadonlyArray<unknown> | undefined =>
  getField(obj, field, isArray);

const formatIssuePath = (path: unknown): string | undefined => {
  if (!Array.isArray(path)) {
    return undefined;
  }

  const segments = path
    .map((segment) => {
      if (typeof segment === "string" || typeof segment === "number") {
        return String(segment);
      }
      return undefined;
    })
    .filter((segment): segment is string => segment !== undefined);

  return segments.length > 0 ? segments.join(".") : undefined;
};

const formatValidationIssue = (issue: unknown): string | undefined => {
  if (typeof issue === "string") {
    return `Validation error: ${issue}`;
  }

  if (issue === null || issue === undefined || typeof issue !== "object") {
    return undefined;
  }

  const message = getStringField(issue, "message");
  const path = formatIssuePath(Reflect.get(issue, "path"));
  const values = getArrayField(issue, "values")
    ?.map((value) => (typeof value === "string" ? value : undefined))
    .filter((value): value is string => value !== undefined);

  if (path !== undefined && values !== undefined && values.length > 0) {
    return `Invalid value at '${path}'. Expected one of: ${values.join(", ")}.`;
  }

  if (message !== undefined && path !== undefined) {
    return `Validation error at '${path}': ${message}`;
  }

  if (message !== undefined) {
    return `Validation error: ${message}`;
  }

  return undefined;
};

const getValidationIssueDetails = (problem: unknown): ReadonlyArray<string> => {
  const issues = getArrayField(problem, "details");
  if (issues === undefined) {
    return [];
  }

  return issues
    .map((issue) => formatValidationIssue(issue))
    .filter((line): line is string => line !== undefined);
};

const buildDetails = (
  detail: string | undefined,
  requestId: string | undefined,
  validationIssueDetails: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const result: Array<string> = [];
  if (detail !== undefined) result.push(detail);
  result.push(...validationIssueDetails);
  if (requestId !== undefined) result.push(`Request ID: ${requestId}`);
  return result;
};

// -----------------------------------------------------------------------------
// Auth error mapping (401/403)
// -----------------------------------------------------------------------------

/**
 * Build a AppError for a 401 Unauthenticated response.
 * Includes WWW-Authenticate header value in details when present.
 */
const mapAuthUnauthenticated = (
  response: HttpClientResponse.HttpClientResponse,
  howToFix: string,
): AppError => {
  const wwwAuth = response.headers["www-authenticate"];
  const details: Array<string> = [];
  if (wwwAuth !== undefined) {
    details.push(`WWW-Authenticate: ${wwwAuth}`);
  }
  return makeAppError({
    code: "AUTH_UNAUTHENTICATED",
    what: "Authentication required",
    details,
    howToFix,
  });
};

/**
 * Build a AppError for a 403 Unauthorized response.
 * Includes required_scope, token_scopes, required_role from response body when present.
 */
const mapAuthUnauthorized = (problem: unknown): AppError => {
  const details: Array<string> = [];
  const requiredScope = getStringField(problem, "required_scope");
  const tokenScopes = getStringField(problem, "token_scopes");
  const requiredRole = getStringField(problem, "required_role");
  if (requiredScope !== undefined) details.push(`Required scope: ${requiredScope}`);
  if (tokenScopes !== undefined) details.push(`Token scopes: ${tokenScopes}`);
  if (requiredRole !== undefined) details.push(`Required role: ${requiredRole}`);

  return makeAppError({
    code: "AUTH_UNAUTHORIZED",
    what: "Insufficient permissions",
    details,
    howToFix: "You do not have permission for this operation. Check your account permissions.",
  });
};

/**
 * Check if a 401/403 response should be mapped to an auth error for read operations.
 * Returns the mapped AppError or undefined if not an auth error.
 */
const mapReadAuthError = (
  response: HttpClientResponse.HttpClientResponse,
  problem: unknown,
): AppError | undefined => {
  if (response.status === 401) {
    return mapAuthUnauthenticated(response, "Run `axm login` to sign in.");
  }
  if (response.status === 403) {
    return mapAuthUnauthorized(problem);
  }
  return undefined;
};

const withRequestContext = (
  error: AppError,
  request: string,
  status: number | undefined,
): AppError => {
  return makeAppError({
    code: error.code,
    what: error.what,
    details: [
      `Request: ${request}`,
      ...(status === undefined ? [] : [`HTTP status: ${String(status)}`]),
      ...error.details,
    ],
    ...(Option.isSome(error.howToFix) && { howToFix: error.howToFix.value }),
    cause: error.cause,
  });
};

const ExtensionSummarySchema = Schema.Struct({
  profile: Schema.String,
  type: ExtensionTypeSchema,
  name: Schema.String,
});

const ExtensionCollectionResponseSchema = Schema.Struct({
  extensions: Schema.Array(ExtensionSummarySchema),
});

const readResponseText = ({
  response,
  requestSummary,
  code,
  what,
}: {
  readonly response: HttpClientResponse.HttpClientResponse;
  readonly requestSummary: string;
  readonly code: string;
  readonly what: string;
}): Effect.Effect<string, AppError> =>
  response.text.pipe(
    Effect.mapError((error) =>
      makeAppError({
        code,
        what,
        details: [requestSummary],
        cause: error,
      }),
    ),
  );

const parseJson = ({
  bodyText,
  requestSummary,
  code,
  what,
}: {
  readonly bodyText: string;
  readonly requestSummary: string;
  readonly code: string;
  readonly what: string;
}): Effect.Effect<unknown, AppError> =>
  Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(bodyText);
      return parsed;
    },
    catch: (error) =>
      makeAppError({
        code,
        what,
        details: [requestSummary],
        cause: error,
      }),
  });

const decodeUnknown = <S extends Schema.Top>(
  schema: S,
  parsed: unknown,
  {
    requestSummary,
    code,
    what,
  }: {
    readonly requestSummary: string;
    readonly code: string;
    readonly what: string;
  },
): Effect.Effect<S["Type"], AppError, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect(schema)(parsed).pipe(
    Effect.mapError((error) =>
      makeAppError({
        code,
        what,
        details: [requestSummary],
        cause: error,
      }),
    ),
  );

const executeRequest = ({
  baseUrl,
  httpClient,
  method,
  url,
  networkCode,
  networkWhat,
}: {
  readonly baseUrl: string;
  readonly httpClient: HttpClient.HttpClient;
  readonly method: "GET" | "HEAD" | "PUT";
  readonly url: string;
  readonly networkCode: string;
  readonly networkWhat: string;
}): Effect.Effect<HttpClientResponse.HttpClientResponse, AppError> => {
  const request =
    method === "GET"
      ? HttpClientRequest.get(url)
      : method === "HEAD"
        ? HttpClientRequest.head(url)
        : HttpClientRequest.put(url);

  return httpClient.execute(request).pipe(
    Effect.mapError((error) =>
      makeAppError({
        code: networkCode,
        what: networkWhat,
        details: [`${method} ${url}`],
        howToFix: buildNetworkHowToFix(baseUrl),
        cause: error,
      }),
    ),
  );
};

// -----------------------------------------------------------------------------
// Remote Registry Client
// -----------------------------------------------------------------------------

const remoteDiscoveryTypes = ["skill", "command", "mcp-server", "pack"] as const;

const toRegistryManifest = (
  index: Schema.Schema.Type<typeof ExtensionIndexSchema>,
  versionConstraint: Option.Option<string>,
): Option.Option<RegistryExtensionManifest> => {
  const selected = resolveVersionEntry(index.versions, versionConstraint);
  if (Option.isNone(selected)) return Option.none();

  const latest = selected.value;

  return Option.some({
    profile: index.profile,
    type: index.type,
    name: index.name,
    description: Option.fromUndefinedOr(index.description),
    repository: Option.fromUndefinedOr(index.repository),
    license: Option.fromUndefinedOr(index.license),
    authors: Option.match(Option.fromUndefinedOr(index.authors), {
      onNone: () => [],
      onSome: (authors) => authors.map((author) => toAuthor(author)),
    }),
    dependencies: latest.dependencies ?? {},
    version: latest.version,
    integrity: latest.integrity,
  });
};

const buildDiscoveryUrl = ({
  baseUrl,
  profile,
  type,
  name,
}: {
  readonly baseUrl: string;
  readonly profile: string;
  readonly type: ExtensionType;
  readonly name: string;
}): string =>
  `${normalizeBaseUrl(baseUrl)}/v1/extensions/${profile}/${pluralizeType(type)}/${name}`;

const getExtensionIndex = ({
  baseUrl,
  httpClient,
  profile,
  type,
  name,
}: {
  readonly baseUrl: string;
  readonly httpClient: HttpClient.HttpClient;
  readonly profile: string;
  readonly type: ExtensionType;
  readonly name: string;
}) =>
  Effect.gen(function* () {
    const url = buildDiscoveryUrl({ baseUrl, profile, type, name });
    const requestSummary = `GET ${url}`;

    const response = yield* executeRequest({
      baseUrl,
      httpClient,
      method: "GET",
      url,
      networkCode: "REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR",
      networkWhat: "Failed to connect to remote registry discovery endpoint",
    });

    if (response.status === 404) {
      return Option.none<Schema.Schema.Type<typeof ExtensionIndexSchema>>();
    }

    // Auth error mapping for read operations
    if (response.status === 401 || response.status === 403) {
      const bodyText = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")));
      const problem = yield* Effect.try({
        try: () => {
          const parsed: unknown = JSON.parse(bodyText);
          return parsed;
        },
        catch: () => null,
      }).pipe(Effect.catch(() => Effect.succeed<unknown>(null)));
      const authError = mapReadAuthError(response, problem);
      if (authError !== undefined) {
        return yield* Effect.fail(authError);
      }
    }

    if (response.status !== 200) {
      const bodyText = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")));
      return yield* Effect.fail(
        makeAppError({
          code: "REGISTRY_REMOTE_DISCOVERY_FAILED",
          what: `Remote discovery failed with status ${String(response.status)}`,
          details: [requestSummary, ...(bodyText.length > 0 ? [bodyText] : [])],
        }),
      );
    }

    const bodyText = yield* readResponseText({
      response,
      requestSummary,
      code: "REGISTRY_REMOTE_DISCOVERY_FAILED",
      what: "Failed to read remote discovery response body",
    });

    const parsed = yield* parseJson({
      bodyText,
      requestSummary,
      code: "REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE",
      what: "Remote discovery returned invalid JSON",
    });

    const index = yield* decodeUnknown(ExtensionIndexSchema, parsed, {
      requestSummary,
      code: "REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE",
      what: "Remote discovery response does not match extension index schema",
    });

    return Option.some(index);
  });

const getExtensionCollection = ({
  baseUrl,
  httpClient,
  url,
}: {
  readonly baseUrl: string;
  readonly httpClient: HttpClient.HttpClient;
  readonly url: string;
}) =>
  Effect.gen(function* () {
    const requestSummary = `GET ${url}`;
    const response = yield* executeRequest({
      baseUrl,
      httpClient,
      method: "GET",
      url,
      networkCode: "REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR",
      networkWhat: "Failed to connect to remote registry discovery endpoint",
    });

    // Auth error mapping for read operations
    if (response.status === 401 || response.status === 403) {
      const bodyText = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")));
      const problem = yield* Effect.try({
        try: () => {
          const parsed: unknown = JSON.parse(bodyText);
          return parsed;
        },
        catch: () => null,
      }).pipe(Effect.catch(() => Effect.succeed<unknown>(null)));
      const authError = mapReadAuthError(response, problem);
      if (authError !== undefined) {
        return yield* Effect.fail(authError);
      }
    }

    if (response.status !== 200) {
      const bodyText = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")));
      return yield* Effect.fail(
        makeAppError({
          code: "REGISTRY_REMOTE_DISCOVERY_FAILED",
          what: `Remote discovery failed with status ${String(response.status)}`,
          details: [requestSummary, ...(bodyText.length > 0 ? [bodyText] : [])],
        }),
      );
    }

    const bodyText = yield* readResponseText({
      response,
      requestSummary,
      code: "REGISTRY_REMOTE_DISCOVERY_FAILED",
      what: "Failed to read remote discovery response body",
    });
    const parsed = yield* parseJson({
      bodyText,
      requestSummary,
      code: "REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE",
      what: "Remote discovery returned invalid JSON",
    });
    const collection = yield* decodeUnknown(ExtensionCollectionResponseSchema, parsed, {
      requestSummary,
      code: "REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE",
      what: "Remote discovery response does not match extension list schema",
    });

    return collection.extensions;
  });

const getListModeExtensions = ({
  baseUrl,
  httpClient,
  args,
}: {
  readonly baseUrl: string;
  readonly httpClient: HttpClient.HttpClient;
  readonly args: GetExtensionsByProfileArgs;
}) =>
  Effect.gen(function* () {
    const profileBaseUrl = `${normalizeBaseUrl(baseUrl)}/v1/extensions/${args.handle}`;
    const urls =
      args.types.length === 0
        ? [profileBaseUrl]
        : args.types.map((type) => `${profileBaseUrl}/${pluralizeType(type)}`);

    const summaryGroups = yield* Effect.forEach(
      urls,
      (url) =>
        getExtensionCollection({
          baseUrl,
          httpClient,
          url,
        }),
      { concurrency: "unbounded" },
    );

    const summaries = summaryGroups.flat();

    const maybeEntries = yield* Effect.forEach(
      summaries,
      (summary) =>
        getExtensionIndex({
          baseUrl,
          httpClient,
          profile: summary.profile,
          type: summary.type,
          name: summary.name,
        }),
      { concurrency: "unbounded" },
    );

    const allExtensions = maybeEntries.flatMap((entry) =>
      Option.match(entry, {
        onNone: () => [],
        onSome: (value) =>
          Option.match(toRegistryManifest(value, Option.none()), {
            onNone: () => [],
            onSome: (manifest) => [manifest],
          }),
      }),
    );

    const sorted = [...allExtensions].sort((a, b) => {
      if (a.profile !== b.profile) {
        return a.profile.localeCompare(b.profile);
      }
      if (a.name !== b.name) {
        return a.name.localeCompare(b.name);
      }
      return a.type.localeCompare(b.type);
    });

    return sorted;
  });

const profileExists = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
  handle: string,
): Effect.Effect<ProfileExistsResponse, AppError> =>
  Effect.gen(function* () {
    const url = `${normalizeBaseUrl(baseUrl)}/v1/extensions/${handle}`;
    const requestSummary = `GET ${url}`;
    const response = yield* executeRequest({
      baseUrl,
      httpClient,
      method: "GET",
      url,
      networkCode: "REGISTRY_REMOTE_NAMESPACE_CHECK_NETWORK_ERROR",
      networkWhat: "Failed to connect to remote registry profile endpoint",
    });

    if (response.status === 404) {
      return { exists: false } satisfies ProfileExistsResponse;
    }

    // Auth error mapping for read operations
    if (response.status === 401 || response.status === 403) {
      const bodyText = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")));
      const problem = yield* Effect.try({
        try: () => {
          const parsed: unknown = JSON.parse(bodyText);
          return parsed;
        },
        catch: () => null,
      }).pipe(Effect.catch(() => Effect.succeed<unknown>(null)));
      const authError = mapReadAuthError(response, problem);
      if (authError !== undefined) {
        return yield* Effect.fail(authError);
      }
    }

    if (response.status !== 200) {
      const bodyText = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")));
      return yield* Effect.fail(
        makeAppError({
          code: "REGISTRY_REMOTE_NAMESPACE_CHECK_FAILED",
          what: `Remote profile check failed with status ${String(response.status)}`,
          details: [requestSummary, ...(bodyText.length > 0 ? [bodyText] : [])],
        }),
      );
    }

    const bodyText = yield* readResponseText({
      response,
      requestSummary,
      code: "REGISTRY_REMOTE_NAMESPACE_CHECK_FAILED",
      what: "Failed to read remote profile response body",
    });
    const parsed = yield* parseJson({
      bodyText,
      requestSummary,
      code: "REGISTRY_REMOTE_INVALID_RESPONSE",
      what: "Remote profile endpoint returned invalid JSON",
    });
    const payload = yield* decodeUnknown(ExtensionCollectionResponseSchema, parsed, {
      requestSummary,
      code: "REGISTRY_REMOTE_INVALID_RESPONSE",
      what: "Remote profile endpoint response does not match expected schema",
    });

    return { exists: payload.extensions.length > 0 } satisfies ProfileExistsResponse;
  });

const getExtensionPackage = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
  args: GetExtensionPackageArgs,
): Effect.Effect<GetExtensionPackageResponse, AppError> =>
  Effect.gen(function* () {
    const indexUrl = buildDiscoveryUrl({
      baseUrl,
      profile: args.handle,
      type: args.type,
      name: args.name,
    });
    const indexRequestSummary = `GET ${indexUrl}`;

    const indexResponse = yield* executeRequest({
      baseUrl,
      httpClient,
      method: "GET",
      url: indexUrl,
      networkCode: "REGISTRY_REMOTE_PACKAGE_FETCH_NETWORK_ERROR",
      networkWhat: "Failed to connect to remote registry package endpoint",
    });

    if (indexResponse.status === 404) {
      return yield* Effect.fail(
        makeAppError({
          code: "REGISTRY_REMOTE_PACKAGE_NOT_FOUND",
          what: "Remote package index was not found",
          details: [indexRequestSummary],
        }),
      );
    }

    // Auth error mapping for read operations
    if (indexResponse.status === 401 || indexResponse.status === 403) {
      const bodyText = yield* indexResponse.text.pipe(Effect.catch(() => Effect.succeed("")));
      const problem = yield* Effect.try({
        try: () => {
          const parsed: unknown = JSON.parse(bodyText);
          return parsed;
        },
        catch: () => null,
      }).pipe(Effect.catch(() => Effect.succeed<unknown>(null)));
      const authError = mapReadAuthError(indexResponse, problem);
      if (authError !== undefined) {
        return yield* Effect.fail(authError);
      }
    }

    if (indexResponse.status !== 200) {
      const bodyText = yield* indexResponse.text.pipe(Effect.catch(() => Effect.succeed("")));
      return yield* Effect.fail(
        makeAppError({
          code: "REGISTRY_REMOTE_PACKAGE_FETCH_FAILED",
          what: `Remote package index request failed with status ${String(indexResponse.status)}`,
          details: [indexRequestSummary, ...(bodyText.length > 0 ? [bodyText] : [])],
        }),
      );
    }

    const indexBodyText = yield* readResponseText({
      response: indexResponse,
      requestSummary: indexRequestSummary,
      code: "REGISTRY_REMOTE_PACKAGE_FETCH_FAILED",
      what: "Failed to read remote package index response body",
    });
    const indexParsed = yield* parseJson({
      bodyText: indexBodyText,
      requestSummary: indexRequestSummary,
      code: "REGISTRY_REMOTE_INVALID_RESPONSE",
      what: "Remote package index returned invalid JSON",
    });
    const index = yield* decodeUnknown(ExtensionIndexSchema, indexParsed, {
      requestSummary: indexRequestSummary,
      code: "REGISTRY_REMOTE_INVALID_RESPONSE",
      what: "Remote package index response does not match extension index schema",
    });

    const resolvedVersion = Option.match(args.version, {
      onNone: () => Option.fromUndefinedOr(index.versions[0]?.version),
      onSome: (requested) =>
        index.versions.some((entry) => entry.version === requested)
          ? Option.some(requested)
          : Option.none<string>(),
    });

    if (Option.isNone(resolvedVersion)) {
      return yield* Effect.fail(
        makeAppError({
          code: "REGISTRY_REMOTE_VERSION_NOT_FOUND",
          what: "Requested package version is not available in remote index",
          details: [indexRequestSummary],
        }),
      );
    }

    const archiveUrl = `${indexUrl}/${resolvedVersion.value}/archive`;
    const archiveRequestSummary = `GET ${archiveUrl}`;
    const archiveResponse = yield* executeRequest({
      baseUrl,
      httpClient,
      method: "GET",
      url: archiveUrl,
      networkCode: "REGISTRY_REMOTE_PACKAGE_FETCH_NETWORK_ERROR",
      networkWhat: "Failed to connect to remote registry package archive endpoint",
    });

    if (archiveResponse.status === 404) {
      return yield* Effect.fail(
        makeAppError({
          code: "REGISTRY_REMOTE_PACKAGE_NOT_FOUND",
          what: "Remote package archive was not found",
          details: [archiveRequestSummary],
        }),
      );
    }

    if (archiveResponse.status !== 200) {
      const bodyText = yield* archiveResponse.text.pipe(Effect.catch(() => Effect.succeed("")));
      return yield* Effect.fail(
        makeAppError({
          code: "REGISTRY_REMOTE_PACKAGE_FETCH_FAILED",
          what: `Remote package archive request failed with status ${String(archiveResponse.status)}`,
          details: [archiveRequestSummary, ...(bodyText.length > 0 ? [bodyText] : [])],
        }),
      );
    }

    const arrayBuffer = yield* archiveResponse.arrayBuffer.pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "REGISTRY_REMOTE_INVALID_RESPONSE",
          what: "Failed to read remote package archive response body",
          details: [archiveRequestSummary],
          cause: error,
        }),
      ),
    );

    return { archive: new Uint8Array(arrayBuffer) } satisfies GetExtensionPackageResponse;
  });

const getExtensionsByScope = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
  args: GetExtensionsByProfileArgs,
): Effect.Effect<GetExtensionsByProfileResponse, AppError> =>
  Effect.gen(function* () {
    const allExtensions =
      args.names.length === 0
        ? yield* getListModeExtensions({ baseUrl, httpClient, args })
        : yield* Effect.gen(function* () {
            const requestedTypes: ReadonlyArray<ExtensionType> =
              args.types.length > 0 ? args.types : remoteDiscoveryTypes;

            const maybeEntries = yield* Effect.forEach(
              args.names,
              (name) =>
                Effect.forEach(
                  requestedTypes,
                  (type) =>
                    getExtensionIndex({
                      baseUrl,
                      httpClient,
                      profile: args.handle,
                      type,
                      name,
                    }),
                  { concurrency: "unbounded" },
                ),
              { concurrency: "unbounded" },
            );

            return maybeEntries.flat().flatMap((entry) =>
              Option.match(entry, {
                onNone: () => [],
                onSome: (value) =>
                  Option.match(toRegistryManifest(value, Option.none()), {
                    onNone: () => [],
                    onSome: (manifest) => [manifest],
                  }),
              }),
            );
          });

    const total = allExtensions.length;
    const sliced = allExtensions.slice(args.offset);
    const extensions = Option.match(args.limit, {
      onNone: () => sliced,
      onSome: (limit) => sliced.slice(0, limit),
    });

    return {
      extensions,
      total,
    } satisfies GetExtensionsByProfileResponse;
  });

const buildExtensionExistsUrl = (baseUrl: string, args: ExtensionExistsArgs): string =>
  `${normalizeBaseUrl(baseUrl)}/v1/extensions/${args.handle}/${pluralizeType(args.type)}/${args.name}`;

const extensionExists = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
  args: ExtensionExistsArgs,
): Effect.Effect<ExtensionExistsResponse, AppError> =>
  Effect.gen(function* () {
    const url = buildExtensionExistsUrl(baseUrl, args);
    const requestSummary = `HEAD ${url}`;

    const response = yield* httpClient.execute(HttpClientRequest.head(url)).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "REGISTRY_REMOTE_EXTENSION_CHECK_NETWORK_ERROR",
          what: "Failed to connect to remote registry extension check endpoint",
          details: [requestSummary],
          howToFix: buildNetworkHowToFix(baseUrl),
          cause: error,
        }),
      ),
    );

    if (response.status === 200) {
      return { exists: true } satisfies ExtensionExistsResponse;
    }

    if (response.status === 404) {
      return { exists: false } satisfies ExtensionExistsResponse;
    }

    // Auth error mapping for read operations
    if (response.status === 401 || response.status === 403) {
      const bodyText = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")));
      const problem = yield* Effect.try({
        try: () => {
          const parsed: unknown = JSON.parse(bodyText);
          return parsed;
        },
        catch: () => null,
      }).pipe(Effect.catch(() => Effect.succeed<unknown>(null)));
      const authError = mapReadAuthError(response, problem);
      if (authError !== undefined) {
        return yield* Effect.fail(authError);
      }
    }

    const bodyText = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")));
    return yield* Effect.fail(
      makeAppError({
        code: "REGISTRY_REMOTE_EXTENSION_CHECK_FAILED",
        what: `Remote extension check failed with status ${String(response.status)}`,
        details: [requestSummary, ...(bodyText.length > 0 ? [bodyText] : [])],
      }),
    );
  });

/**
 * Build the publish URL for an extension version.
 */
const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

const buildNetworkHowToFix = (baseUrl: string): string => {
  const fallback = "Check registry URL/network connectivity and retry.";

  try {
    const parsed = new URL(baseUrl);
    const isLocalhost = isLoopbackAddress(parsed.hostname);

    if (isLocalhost && parsed.protocol === "https:") {
      return "Ensure local registry is running with TLS, or switch the source URL to http://localhost:<port>.";
    }

    if (isLocalhost) {
      return "Ensure local registry is running and reachable at the configured host/port.";
    }

    return fallback;
  } catch {
    return fallback;
  }
};

const buildNetworkDiagnosis = (baseUrl: string): Option.Option<string> => {
  try {
    const parsed = new URL(baseUrl);
    const isLocalhost = isLoopbackAddress(parsed.hostname);

    if (isLocalhost && parsed.protocol === "https:") {
      return Option.some("Diagnosis: Local registry appears HTTP-only while source uses HTTPS.");
    }

    return Option.none();
  } catch {
    return Option.none();
  }
};

const buildPublishUrl = (baseUrl: string, args: PublishExtensionArgs): string =>
  `${normalizeBaseUrl(baseUrl)}/v1/extensions/${args.handle}/${pluralizeType(args.type)}/${args.name}/${args.version}`;

/**
 * Publish an extension version to the remote registry via multipart PUT.
 */
const publishExtension = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
  args: PublishExtensionArgs,
) =>
  Effect.gen(function* () {
    const url = buildPublishUrl(baseUrl, args);
    const requestSummary = `PUT ${url}`;
    const networkHowToFix = buildNetworkHowToFix(baseUrl);
    const networkDiagnosis = buildNetworkDiagnosis(baseUrl);

    // Build multipart FormData
    const formData = new FormData();
    formData.append(
      "archive",
      new Blob([args.archive], { type: "application/zip" }),
      "archive.zip",
    );
    formData.append("integrity", args.metadata.integrity);

    // Build request
    const request = HttpClientRequest.put(url).pipe(HttpClientRequest.bodyFormData(formData));

    // Execute request
    const response = yield* httpClient.execute(request).pipe(
      Effect.catch((error) =>
        HttpClientError.isHttpClientError(error) && error.reason._tag === "TransportError"
          ? Effect.fail(
              makeAppError({
                code: "REGISTRY_PUBLISH_NETWORK_ERROR",
                what: "Failed to connect to the remote registry",
                details: [
                  `Request: ${requestSummary}`,
                  ...(Option.isSome(networkDiagnosis) ? [networkDiagnosis.value] : []),
                  error.message,
                ],
                howToFix: networkHowToFix,
                cause: error,
              }),
            )
          : Effect.fail(
              makeAppError({
                code: "REGISTRY_PUBLISH_NETWORK_ERROR",
                what: "Failed to connect to the remote registry",
                details: [
                  `Request: ${requestSummary}`,
                  ...(Option.isSome(networkDiagnosis) ? [networkDiagnosis.value] : []),
                ],
                howToFix: networkHowToFix,
                cause: error,
              }),
            ),
      ),
    );

    // Handle success (200, 201)
    if (response.status === 200 || response.status === 201) {
      return { published: true as const };
    }

    // Handle 401 — unauthenticated (check before body parsing)
    if (response.status === 401) {
      return yield* Effect.fail(
        withRequestContext(
          mapAuthUnauthenticated(response, "Session expired. Run `axm login` to re-authenticate."),
          requestSummary,
          response.status,
        ),
      );
    }

    // Handle error: read body and try to parse as problem detail
    const bodyText = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")));

    const problem = yield* Effect.try({
      try: () => {
        const parsed: unknown = JSON.parse(bodyText);
        return parsed;
      },
      catch: () => null,
    }).pipe(Effect.catch(() => Effect.succeed<unknown>(null)));

    // Handle 403 — check quota_exceeded first, then generic auth unauthorized
    if (response.status === 403) {
      const code = problem !== null ? getStringField(problem, "code") : undefined;
      if (code === "quota_exceeded") {
        // Preserve existing quota_exceeded mapping (takes priority)
        return yield* Effect.fail(
          withRequestContext(
            mapProblemDetailToAppError(response.status, problem),
            requestSummary,
            response.status,
          ),
        );
      }
      return yield* Effect.fail(
        withRequestContext(mapAuthUnauthorized(problem), requestSummary, response.status),
      );
    }

    if (problem === null) {
      // Non-JSON error response
      return yield* Effect.fail(
        makeAppError({
          code: "REGISTRY_PUBLISH_FAILED",
          what: `Publish failed with status ${String(response.status)}`,
          details: [`Request: ${requestSummary}`, ...(bodyText.length > 0 ? [bodyText] : [])],
        }),
      );
    }

    return yield* Effect.fail(
      withRequestContext(
        mapProblemDetailToAppError(response.status, problem),
        requestSummary,
        response.status,
      ),
    );
  });

/**
 * Creates a remote HTTPS registry client.
 *
 * Implements `publishExtension` via multipart PUT. All read operations
 * fail with "remote registry not yet supported" error.
 *
 * @param baseUrl - Base URL of the remote registry (e.g. `https://registry.example.com`)
 * @param httpClient - Effect HttpClient instance for making HTTP requests
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createRemoteRegistryClient = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
): RegistryClient => ({
  getExtensionsByScope: (args) => getExtensionsByScope(baseUrl, httpClient, args),
  profileExists: (handle) => profileExists(baseUrl, httpClient, handle),
  getExtensionIndex: (args: GetExtensionIndexArgs) =>
    getExtensionIndex({
      baseUrl,
      httpClient,
      profile: args.handle,
      type: args.type,
      name: args.name,
    }),
  getExtensionPackage: (args) => getExtensionPackage(baseUrl, httpClient, args),
  publishExtension: (args) => publishExtension(baseUrl, httpClient, args),
  extensionExists: (args) => extensionExists(baseUrl, httpClient, args),
});
