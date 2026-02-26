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

import type * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientError from "@effect/platform/HttpClientError";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { type CliError, makeCliError } from "../cli-error/index.js";
import type {
  ExtensionExistsArgs,
  ExtensionExistsResponse,
  GetExtensionsByNamespaceArgs,
  GetExtensionsByNamespaceResponse,
  PublishExtensionArgs,
  RegistryClient,
  RegistryExtensionManifest,
} from "./client.js";
import { toAuthor, type ExtensionType } from "../extensions/common.js";
import { ExtensionIndexSchema } from "./local-schema.js";
import { pluralizeType } from "./utils.js";

// -----------------------------------------------------------------------------
// RFC 7807 Problem Detail → CliError Mapping
// -----------------------------------------------------------------------------

/**
 * Maps an HTTP status code and parsed RFC 7807 problem detail JSON to a `CliError`.
 *
 * Handles all backend error codes from the remote registry publish API.
 * When the problem detail is null/undefined (non-JSON response), falls back
 * to a generic `REGISTRY_PUBLISH_FAILED` error.
 */
export const mapProblemDetailToCliError = (status: number, problem: unknown): CliError => {
  const detail = getStringField(problem, "detail");
  const requestId = getStringField(problem, "requestId");
  const validationIssueDetails = getValidationIssueDetails(problem);
  const code = getStringField(problem, "code");
  const details = buildDetails(detail, requestId, validationIssueDetails);

  if (code !== undefined) {
    // 409 publish_conflict
    if (status === 409 && code === "publish_conflict") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_CONFLICT",
        what: "Version already exists with different content",
        details,
        howToFix:
          "This version already exists with different content. Bump the version in your manifest.",
      });
    }

    // 400 malformed_archive / empty_archive
    if (status === 400 && (code === "malformed_archive" || code === "empty_archive")) {
      return makeCliError({
        code: "REGISTRY_PUBLISH_INVALID_ARCHIVE",
        what: "Invalid extension archive",
        details,
        howToFix: "Check the extension directory and rebuild",
      });
    }

    // 413 ingest_*_too_large
    if (status === 413 && code.startsWith("ingest_") && code.endsWith("_too_large")) {
      return makeCliError({
        code: "REGISTRY_PUBLISH_TOO_LARGE",
        what: "Extension archive exceeds size limit",
        details,
        howToFix: "Reduce archive size or remove unnecessary files",
      });
    }

    // 415 ingest_unsupported_content_type
    if (status === 415 && code === "ingest_unsupported_content_type") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_INVALID_ARCHIVE",
        what: "Unsupported archive content type",
        details,
      });
    }

    // 422 integrity_mismatch (check before manifest_* since both are 422)
    if (status === 422 && code === "integrity_mismatch") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_INTEGRITY_MISMATCH",
        what: "Archive integrity does not match",
        details,
      });
    }

    // 422 manifest_*
    if (status === 422 && code.startsWith("manifest_")) {
      return makeCliError({
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
      return makeCliError({
        code: "REGISTRY_PUBLISH_THROTTLED",
        what: "Publish request was rate limited",
        details,
        howToFix: retryMsg,
      });
    }

    // 403 quota_exceeded
    if (status === 403 && code === "quota_exceeded") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_QUOTA_EXCEEDED",
        what: "Storage quota exceeded",
        details,
        howToFix: "Storage quota exceeded for this extension",
      });
    }

    // 501 publish_type_not_implemented
    if (status === 501 && code === "publish_type_not_implemented") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_TYPE_NOT_SUPPORTED",
        what: "Extension type is not supported for publishing",
        details,
      });
    }

    // 503 publish_disabled
    if (status === 503 && code === "publish_disabled") {
      return makeCliError({
        code: "REGISTRY_PUBLISH_DISABLED",
        what: "Publishing is temporarily disabled",
        details,
        howToFix: "Publishing is temporarily disabled. Try again later.",
      });
    }
  }

  // Fallback: unexpected status or unrecognized code
  return makeCliError({
    code: "REGISTRY_PUBLISH_FAILED",
    what: `Publish failed with status ${String(status)}`,
    details,
  });
};

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

const getStringField = (obj: unknown, field: string): string | undefined => {
  if (obj !== null && obj !== undefined && typeof obj === "object" && field in obj) {
    const value = (obj as Record<string, unknown>)[field];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
};

const getNumberField = (obj: unknown, field: string): number | undefined => {
  if (obj !== null && obj !== undefined && typeof obj === "object" && field in obj) {
    const value = (obj as Record<string, unknown>)[field];
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
};

const getArrayField = (obj: unknown, field: string): ReadonlyArray<unknown> | undefined => {
  if (obj !== null && obj !== undefined && typeof obj === "object" && field in obj) {
    const value = (obj as Record<string, unknown>)[field];
    return Array.isArray(value) ? value : undefined;
  }
  return undefined;
};

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
  const path = formatIssuePath((issue as Record<string, unknown>)["path"]);
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

const withRequestContext = (
  error: CliError,
  request: string,
  status: number | undefined,
): CliError => {
  const howToFix = Option.match(error.howToFix, {
    onNone: () => Option.none<string>(),
    onSome: (value) => Option.some(value),
  });

  return makeCliError({
    code: error.code,
    what: error.what,
    details: [
      `Request: ${request}`,
      ...(status === undefined ? [] : [`HTTP status: ${String(status)}`]),
      ...error.details,
    ],
    ...(Option.isSome(howToFix) && { howToFix: howToFix.value }),
    cause: error.cause,
  });
};

// -----------------------------------------------------------------------------
// Remote Registry Client
// -----------------------------------------------------------------------------

const remoteReadNotImplemented = ({
  code,
  what,
  operation,
}: {
  readonly code: string;
  readonly what: string;
  readonly operation: string;
}) =>
  Effect.fail(
    makeCliError({
      code,
      what,
      howToFix: `Implement remote registry read operation: ${operation}`,
    }),
  );

const remoteDiscoveryTypes = ["skill", "command", "mcp-server", "pack"] as const;

const toRegistryManifest = (
  index: typeof ExtensionIndexSchema.Type,
): Option.Option<RegistryExtensionManifest> => {
  const latest = index.versions[0];
  if (latest === undefined) {
    return Option.none();
  }

  return Option.some({
    namespace: index.namespace,
    type: index.type,
    name: index.name,
    description: Option.fromNullable(index.description),
    repository: Option.fromNullable(index.repository),
    license: Option.fromNullable(index.license),
    authors: Option.match(Option.fromNullable(index.authors), {
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
  namespace,
  type,
  name,
}: {
  readonly baseUrl: string;
  readonly namespace: string;
  readonly type: ExtensionType;
  readonly name: string;
}): string =>
  `${normalizeBaseUrl(baseUrl)}/v1/extensions/${namespace}/${pluralizeType(type)}/${name}`;

const getExtensionIndex = ({
  baseUrl,
  httpClient,
  namespace,
  type,
  name,
}: {
  readonly baseUrl: string;
  readonly httpClient: HttpClient.HttpClient;
  readonly namespace: string;
  readonly type: ExtensionType;
  readonly name: string;
}) =>
  Effect.gen(function* () {
    const url = buildDiscoveryUrl({ baseUrl, namespace, type, name });
    const requestSummary = `GET ${url}`;

    const response = yield* httpClient.execute(HttpClientRequest.get(url)).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR",
          what: "Failed to connect to remote registry discovery endpoint",
          details: [requestSummary],
          howToFix: buildNetworkHowToFix(baseUrl),
          cause: error,
        }),
      ),
    );

    if (response.status === 404) {
      return Option.none<RegistryExtensionManifest>();
    }

    if (response.status !== 200) {
      const bodyText = yield* response.text.pipe(Effect.catchAll(() => Effect.succeed("")));
      return yield* Effect.fail(
        makeCliError({
          code: "REGISTRY_REMOTE_DISCOVERY_FAILED",
          what: `Remote discovery failed with status ${String(response.status)}`,
          details: [requestSummary, ...(bodyText.length > 0 ? [bodyText] : [])],
        }),
      );
    }

    const bodyText = yield* response.text.pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "REGISTRY_REMOTE_DISCOVERY_FAILED",
          what: "Failed to read remote discovery response body",
          details: [requestSummary],
          cause: error,
        }),
      ),
    );

    const parsed = yield* Effect.try({
      try: () => JSON.parse(bodyText) as unknown,
      catch: (error) =>
        makeCliError({
          code: "REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE",
          what: "Remote discovery returned invalid JSON",
          details: [requestSummary],
          cause: error,
        }),
    });

    const index = yield* Schema.decodeUnknown(ExtensionIndexSchema)(parsed).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE",
          what: "Remote discovery response does not match extension index schema",
          details: [requestSummary],
          cause: error,
        }),
      ),
    );

    return toRegistryManifest(index);
  });

const getExtensionsByScope = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
  args: GetExtensionsByNamespaceArgs,
): Effect.Effect<GetExtensionsByNamespaceResponse, CliError> =>
  Effect.gen(function* () {
    if (args.names.length === 0) {
      return yield* remoteReadNotImplemented({
        code: "REGISTRY_REMOTE_DISCOVERY_LIST_NOT_IMPLEMENTED",
        what: "remote registry getExtensionsByScope list mode is not implemented yet",
        operation: "getExtensionsByScope (names=[])",
      });
    }

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
              namespace: args.namespace,
              type,
              name,
            }),
          { concurrency: "unbounded" },
        ),
      { concurrency: "unbounded" },
    );

    const allExtensions = maybeEntries.flat().flatMap((entry) =>
      Option.match(entry, {
        onNone: () => [],
        onSome: (value) => [value],
      }),
    );

    const total = allExtensions.length;
    const sliced = allExtensions.slice(args.offset);
    const extensions = Option.match(args.limit, {
      onNone: () => sliced,
      onSome: (limit) => sliced.slice(0, limit),
    });

    return {
      extensions,
      total,
    } satisfies GetExtensionsByNamespaceResponse;
  });

const buildExtensionExistsUrl = (baseUrl: string, args: ExtensionExistsArgs): string =>
  `${normalizeBaseUrl(baseUrl)}/v1/extensions/${args.namespace}/${pluralizeType(args.type)}/${args.name}`;

const extensionExists = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
  args: ExtensionExistsArgs,
): Effect.Effect<ExtensionExistsResponse, CliError> =>
  Effect.gen(function* () {
    const url = buildExtensionExistsUrl(baseUrl, args);
    const requestSummary = `HEAD ${url}`;

    const response = yield* httpClient.execute(HttpClientRequest.head(url)).pipe(
      Effect.mapError((error) =>
        makeCliError({
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

    const bodyText = yield* response.text.pipe(Effect.catchAll(() => Effect.succeed("")));
    return yield* Effect.fail(
      makeCliError({
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
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";

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
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";

    if (isLocalhost && parsed.protocol === "https:") {
      return Option.some("Diagnosis: Local registry appears HTTP-only while source uses HTTPS.");
    }

    return Option.none();
  } catch {
    return Option.none();
  }
};

const buildPublishUrl = (baseUrl: string, args: PublishExtensionArgs): string =>
  `${normalizeBaseUrl(baseUrl)}/v1/extensions/${args.namespace}/${pluralizeType(args.type)}/${args.name}/${args.version}`;

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
      Effect.catchAll((error) =>
        HttpClientError.isHttpClientError(error) && error._tag === "RequestError"
          ? Effect.fail(
              makeCliError({
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
              makeCliError({
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

    // Handle error: read body and try to parse as problem detail
    const bodyText = yield* response.text.pipe(Effect.catchAll(() => Effect.succeed("")));

    const problem = yield* Effect.try({
      try: () => JSON.parse(bodyText) as unknown,
      catch: () => null,
    }).pipe(Effect.catchAll(() => Effect.succeed<unknown>(null)));

    if (problem === null) {
      // Non-JSON error response
      return yield* Effect.fail(
        makeCliError({
          code: "REGISTRY_PUBLISH_FAILED",
          what: `Publish failed with status ${String(response.status)}`,
          details: [`Request: ${requestSummary}`, ...(bodyText.length > 0 ? [bodyText] : [])],
        }),
      );
    }

    return yield* Effect.fail(
      withRequestContext(
        mapProblemDetailToCliError(response.status, problem),
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
  namespaceExists: () =>
    remoteReadNotImplemented({
      code: "REGISTRY_REMOTE_NAMESPACE_CHECK_NOT_IMPLEMENTED",
      what: "remote registry namespaceExists is not implemented yet",
      operation: "namespaceExists",
    }),
  getExtensionPackage: () =>
    remoteReadNotImplemented({
      code: "REGISTRY_REMOTE_PACKAGE_FETCH_NOT_IMPLEMENTED",
      what: "remote registry getExtensionPackage is not implemented yet",
      operation: "getExtensionPackage",
    }),
  publishExtension: (args) => publishExtension(baseUrl, httpClient, args),
  extensionExists: (args) => extensionExists(baseUrl, httpClient, args),
});
