/**
 * Remote HTTPS registry client.
 *
 * Implements `RegistryClient` by delegating HTTP transport to the generated
 * registry client and mapping all errors to `AppError` with per-operation codes.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as Schema from "effect/Schema";
import { type AppError, makeAppError } from "../app-error/index.js";
import { toAuthor, ExtensionTypeSchema, type ExtensionType } from "../extensions/index.js";
import type { ExtensionIndex } from "./schema.js";
import { pluralizeType, resolveVersionEntry } from "./utils.js";
import type {
  ExtensionExistsArgs,
  ExtensionExistsResponse,
  GetExtensionIndexArgs,
  GetExtensionPackageArgs,
  GetExtensionPackageResponse,
  GetExtensionsByProfileArgs,
  GetExtensionsByProfileResponse,
  ProfileExistsResponse,
  PublishExtensionArgs,
  PublishExtensionResponse,
  RegistryClient,
  RegistryExtensionManifest,
} from "./client.js";
import {
  isRegistryClientError,
  isHttpClientError,
  isSchemaError,
  isAnyRegistryClientError,
  hasTagSuffix,
  getTag,
  mapAuthUnauthenticated,
  mapAuthUnauthorized,
  mapNetworkError,
  mapSchemaError,
  mapUnexpectedStatusError,
  getErrorCode,
  buildErrorDetails,
  getRetryAfterSeconds,
  buildNetworkHowToFix,
  buildNetworkDiagnosis,
} from "./error-mapping.js";
import * as GeneratedRegistryClient from "./__generated__/registry-client.js";
import type {
  ExtensionsGet200,
  ExtensionsListByProfile200,
} from "./__generated__/registry-client.js";

// -----------------------------------------------------------------------------
// Type Mapping Helpers
// -----------------------------------------------------------------------------

const decodeExtensionType = Schema.decodeUnknownSync(ExtensionTypeSchema);

/**
 * Narrow a string to ExtensionType via Schema validation.
 * The generated client uses a wider union than our domain type;
 * this validates the value is within our supported subset.
 */
const narrowExtensionType = (type: string): ExtensionType => decodeExtensionType(type);

/**
 * Map the generated ExtensionsGet200 response to our domain ExtensionIndex type.
 */
const mapToExtensionIndex = (response: ExtensionsGet200): ExtensionIndex => ({
  name: response.name,
  profile: response.profile,
  type: narrowExtensionType(response.type),
  description: response.description ?? undefined,
  repository: response.repository ?? undefined,
  license: response.license ?? undefined,
  authors:
    response.authors === null || response.authors === undefined
      ? undefined
      : response.authors.map((a) => ({
          name: a.name ?? "",
          email: a.email ?? undefined,
          url: a.url ?? undefined,
        })),
  versions: response.versions.map((v) => ({
    version: v.version,
    published: v.published,
    integrity: v.integrity,
    dependencies: v.dependencies === null ? undefined : v.dependencies,
  })),
});

/**
 * Convert an ExtensionIndex + version constraint to a RegistryExtensionManifest.
 */
const toRegistryManifest = (
  index: ExtensionIndex,
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
    authors: index.authors === undefined ? [] : index.authors.map((author) => toAuthor(author)),
    dependencies: latest.dependencies ?? {},
    version: latest.version,
    integrity: latest.integrity,
  });
};

// -----------------------------------------------------------------------------
// Remote Registry Client
// -----------------------------------------------------------------------------

const remoteDiscoveryTypes: ReadonlyArray<ExtensionType> = [
  "skill",
  "command",
  "mcp-server",
  "pack",
] as const;

/**
 * Creates a remote HTTPS registry client.
 *
 * Uses the generated registry client for all HTTP transport and maps
 * generated errors to domain AppError codes per-operation.
 *
 * @param baseUrl - Base URL of the remote registry (e.g. `https://registry.example.com`)
 * @param httpClient - Effect HttpClient instance for making HTTP requests
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createRemoteRegistryClient = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
): RegistryClient => {
  const client = GeneratedRegistryClient.make(
    httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl))),
  );

  // ---------------------------------------------------------------------------
  // getExtensionIndex
  // ---------------------------------------------------------------------------
  const getExtensionIndex = (args: GetExtensionIndexArgs) =>
    client.ExtensionsGet(args.handle, pluralizeType(args.type), args.name, undefined).pipe(
      Effect.map((response) => Option.some(mapToExtensionIndex(response))),
      Effect.catch((e) => mapDiscoveryErrorWithNotFound(e, "REGISTRY_REMOTE_DISCOVERY")),
    );

  /**
   * Map discovery errors, treating 404 as Option.none().
   */
  const mapDiscoveryErrorWithNotFound = (
    e: unknown,
    prefix: string,
  ): Effect.Effect<Option.Option<ExtensionIndex>, AppError> => {
    // 404 → Option.none()
    if (isRegistryClientError("ExtensionsGet404")(e)) {
      return Effect.succeed(Option.none<ExtensionIndex>());
    }
    return Effect.fail(mapDiscoveryError(e, prefix));
  };

  /**
   * Map all discovery/read errors to AppError.
   */
  const mapDiscoveryError = (e: unknown, prefix: string): AppError => {
    if (isHttpClientError(e)) {
      return mapNetworkError(
        e,
        `${prefix}_NETWORK_ERROR`,
        "Failed to connect to remote registry discovery endpoint",
        baseUrl,
      );
    }

    if (hasTagSuffix(e, "401") && isAnyRegistryClientError(e)) {
      return mapAuthUnauthenticated(e);
    }
    if (hasTagSuffix(e, "403") && isAnyRegistryClientError(e)) {
      return mapAuthUnauthorized(e);
    }

    if (isSchemaError(e)) {
      return mapSchemaError(
        e,
        `${prefix}_INVALID_RESPONSE`,
        "Remote discovery response does not match expected schema",
      );
    }

    if (isAnyRegistryClientError(e)) {
      return mapUnexpectedStatusError(e, `${prefix}_FAILED`, "Remote discovery failed");
    }

    return makeAppError({
      code: `${prefix}_FAILED`,
      what: "Remote discovery failed",
      cause: e,
    });
  };

  // ---------------------------------------------------------------------------
  // getExtensionsByScope
  // ---------------------------------------------------------------------------
  const getExtensionsByScope = (
    args: GetExtensionsByProfileArgs,
  ): Effect.Effect<GetExtensionsByProfileResponse, AppError> =>
    Effect.gen(function* () {
      let allExtensions: ReadonlyArray<RegistryExtensionManifest>;

      if (args.names.length === 0) {
        // List mode: fetch profile listing, then fan-out to get full indexes
        allExtensions = yield* getListModeExtensions(args);
      } else {
        // Named mode: fetch each name+type combination
        const requestedTypes: ReadonlyArray<ExtensionType> =
          args.types.length > 0 ? args.types : remoteDiscoveryTypes;

        const maybeEntries = yield* Effect.forEach(
          args.names,
          (name) =>
            Effect.forEach(
              requestedTypes,
              (type) =>
                getExtensionIndex({
                  handle: args.handle,
                  type,
                  name,
                }),
              { concurrency: "unbounded" },
            ),
          { concurrency: "unbounded" },
        );

        allExtensions = maybeEntries.flat().flatMap((entry) =>
          Option.match(entry, {
            onNone: () => [],
            onSome: (value) =>
              Option.match(toRegistryManifest(value, Option.none()), {
                onNone: () => [],
                onSome: (manifest) => [manifest],
              }),
          }),
        );
      }

      const total = allExtensions.length;
      const sliced = allExtensions.slice(args.offset);
      const extensions = Option.match(args.limit, {
        onNone: () => sliced,
        onSome: (limit) => sliced.slice(0, limit),
      });

      return { extensions, total };
    });

  const getListModeExtensions = (
    args: GetExtensionsByProfileArgs,
  ): Effect.Effect<ReadonlyArray<RegistryExtensionManifest>, AppError> =>
    Effect.gen(function* () {
      // Fetch extension lists by type
      const listResults =
        args.types.length === 0
          ? [yield* fetchExtensionList(args.handle)]
          : yield* Effect.forEach(
              args.types,
              (type) => fetchExtensionListByType(args.handle, type),
              { concurrency: "unbounded" },
            );

      const summaries = listResults.flat();

      // Fetch full indexes for each extension
      const maybeEntries = yield* Effect.forEach(
        summaries,
        (summary) =>
          getExtensionIndex({
            handle: summary.profile,
            type: narrowExtensionType(summary.type),
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
        if (a.profile !== b.profile) return a.profile.localeCompare(b.profile);
        if (a.name !== b.name) return a.name.localeCompare(b.name);
        return a.type.localeCompare(b.type);
      });

      return sorted;
    });

  const fetchExtensionList = (
    handle: string,
  ): Effect.Effect<ExtensionsListByProfile200["extensions"], AppError> =>
    client.ExtensionsListByProfile(handle, undefined).pipe(
      Effect.map((response) => response.extensions),
      mapDiscoveryErrors,
    );

  const fetchExtensionListByType = (
    handle: string,
    type: ExtensionType,
  ): Effect.Effect<ExtensionsListByProfile200["extensions"], AppError> =>
    client.ExtensionsListByType(handle, pluralizeType(type), undefined).pipe(
      Effect.map((response) => response.extensions),
      mapDiscoveryErrors,
    );

  /**
   * Shared error mapping for discovery (list/search) operations.
   */
  const mapDiscoveryErrors = <A>(effect: Effect.Effect<A, unknown>): Effect.Effect<A, AppError> =>
    effect.pipe(Effect.mapError((e) => mapDiscoveryError(e, "REGISTRY_REMOTE_DISCOVERY")));

  // ---------------------------------------------------------------------------
  // profileExists
  // ---------------------------------------------------------------------------
  const profileExists = (handle: string): Effect.Effect<ProfileExistsResponse, AppError> =>
    client.ExtensionsListByProfile(handle, undefined).pipe(
      Effect.map(
        (response) => ({ exists: response.extensions.length > 0 }) satisfies ProfileExistsResponse,
      ),
      Effect.catch((e) => {
        // 404 → not found
        if (hasTagSuffix(e, "404")) {
          return Effect.succeed({ exists: false } satisfies ProfileExistsResponse);
        }
        return Effect.fail(mapProfileExistsError(e));
      }),
    );

  /**
   * Map profileExists errors to AppError.
   */
  const mapProfileExistsError = (e: unknown): AppError => {
    if (isHttpClientError(e)) {
      return mapNetworkError(
        e,
        "REGISTRY_REMOTE_NAMESPACE_CHECK_NETWORK_ERROR",
        "Failed to connect to remote registry profile endpoint",
        baseUrl,
      );
    }

    if (hasTagSuffix(e, "401") && isAnyRegistryClientError(e)) {
      return mapAuthUnauthenticated(e);
    }
    if (hasTagSuffix(e, "403") && isAnyRegistryClientError(e)) {
      return mapAuthUnauthorized(e);
    }
    if (isSchemaError(e)) {
      return mapSchemaError(
        e,
        "REGISTRY_REMOTE_INVALID_RESPONSE",
        "Remote profile endpoint response does not match expected schema",
      );
    }
    if (isAnyRegistryClientError(e)) {
      return mapUnexpectedStatusError(
        e,
        "REGISTRY_REMOTE_NAMESPACE_CHECK_FAILED",
        "Remote profile check failed",
      );
    }
    return makeAppError({
      code: "REGISTRY_REMOTE_NAMESPACE_CHECK_FAILED",
      what: "Remote profile check failed",
      cause: e,
    });
  };

  // ---------------------------------------------------------------------------
  // getExtensionPackage
  // ---------------------------------------------------------------------------
  const getExtensionPackage = (
    args: GetExtensionPackageArgs,
  ): Effect.Effect<GetExtensionPackageResponse, AppError> =>
    Effect.gen(function* () {
      // Step 1: Fetch extension index
      const indexResult = yield* client
        .ExtensionsGet(args.handle, pluralizeType(args.type), args.name, undefined)
        .pipe(Effect.mapError((e) => mapPackageFetchError(e)));

      const index = mapToExtensionIndex(indexResult);

      // Step 2: Resolve version
      const resolvedVersion = Option.match(args.version, {
        onNone: () => Option.fromUndefinedOr(index.versions[0]?.version),
        onSome: (requested) =>
          index.versions.some((entry) => entry.version === requested)
            ? Option.some(requested)
            : Option.none<string>(),
      });

      if (Option.isNone(resolvedVersion)) {
        return yield* makeAppError({
          code: "REGISTRY_REMOTE_VERSION_NOT_FOUND",
          what: "Requested package version is not available in remote index",
        });
      }

      // Step 3: Download archive
      const archive = yield* client
        .ExtensionsDownloadArchive(
          args.handle,
          pluralizeType(args.type),
          args.name,
          resolvedVersion.value,
          undefined,
        )
        .pipe(Effect.mapError((e) => mapArchiveFetchError(e)));

      return { archive } satisfies GetExtensionPackageResponse;
    });

  /**
   * Map errors from the index fetch step of getExtensionPackage.
   */
  const mapPackageFetchError = (e: unknown): AppError => {
    if (isRegistryClientError("ExtensionsGet404")(e)) {
      return makeAppError({
        code: "REGISTRY_REMOTE_PACKAGE_NOT_FOUND",
        what: "Remote package index was not found",
      });
    }
    if (isHttpClientError(e)) {
      return mapNetworkError(
        e,
        "REGISTRY_REMOTE_PACKAGE_FETCH_NETWORK_ERROR",
        "Failed to connect to remote registry package endpoint",
        baseUrl,
      );
    }
    if (isSchemaError(e)) {
      return mapSchemaError(
        e,
        "REGISTRY_REMOTE_INVALID_RESPONSE",
        "Remote package index response does not match expected schema",
      );
    }
    if (isAnyRegistryClientError(e)) {
      return mapUnexpectedStatusError(
        e,
        "REGISTRY_REMOTE_PACKAGE_FETCH_FAILED",
        "Remote package index request failed",
      );
    }
    return makeAppError({
      code: "REGISTRY_REMOTE_PACKAGE_FETCH_FAILED",
      what: "Remote package index request failed",
      cause: e,
    });
  };

  /**
   * Map errors from the archive download step of getExtensionPackage.
   */
  const mapArchiveFetchError = (e: unknown): AppError => {
    if (isRegistryClientError("ExtensionsDownloadArchive404")(e)) {
      return makeAppError({
        code: "REGISTRY_REMOTE_PACKAGE_NOT_FOUND",
        what: "Remote package archive was not found",
      });
    }
    if (isHttpClientError(e)) {
      return mapNetworkError(
        e,
        "REGISTRY_REMOTE_PACKAGE_FETCH_NETWORK_ERROR",
        "Failed to connect to remote registry package archive endpoint",
        baseUrl,
      );
    }
    if (isSchemaError(e)) {
      return mapSchemaError(
        e,
        "REGISTRY_REMOTE_INVALID_RESPONSE",
        "Failed to read remote package archive response",
      );
    }
    if (isAnyRegistryClientError(e)) {
      return mapUnexpectedStatusError(
        e,
        "REGISTRY_REMOTE_PACKAGE_FETCH_FAILED",
        "Remote package archive request failed",
      );
    }
    return makeAppError({
      code: "REGISTRY_REMOTE_PACKAGE_FETCH_FAILED",
      what: "Remote package archive request failed",
      cause: e,
    });
  };

  // ---------------------------------------------------------------------------
  // extensionExists
  // ---------------------------------------------------------------------------
  const extensionExists = (
    args: ExtensionExistsArgs,
  ): Effect.Effect<ExtensionExistsResponse, AppError> =>
    client.ExtensionsHead(args.handle, pluralizeType(args.type), args.name, undefined).pipe(
      Effect.map(() => ({ exists: true }) satisfies ExtensionExistsResponse),
      Effect.catch((e) => {
        if (getTag(e) === "404") {
          return Effect.succeed({ exists: false } satisfies ExtensionExistsResponse);
        }
        return Effect.fail(mapExtensionExistsError(e));
      }),
    );

  /**
   * Map extensionExists errors to AppError.
   */
  const mapExtensionExistsError = (e: unknown): AppError => {
    if (isHttpClientError(e)) {
      return mapNetworkError(
        e,
        "REGISTRY_REMOTE_EXTENSION_CHECK_NETWORK_ERROR",
        "Failed to connect to remote registry extension check endpoint",
        baseUrl,
      );
    }
    if (hasTagSuffix(e, "401") && isAnyRegistryClientError(e)) {
      return mapAuthUnauthenticated(e);
    }
    if (hasTagSuffix(e, "403") && isAnyRegistryClientError(e)) {
      return mapAuthUnauthorized(e);
    }
    if (isAnyRegistryClientError(e)) {
      return mapUnexpectedStatusError(
        e,
        "REGISTRY_REMOTE_EXTENSION_CHECK_FAILED",
        "Remote extension check failed",
      );
    }
    return makeAppError({
      code: "REGISTRY_REMOTE_EXTENSION_CHECK_FAILED",
      what: "Remote extension check failed",
      cause: e,
    });
  };

  // ---------------------------------------------------------------------------
  // publishExtension
  // ---------------------------------------------------------------------------
  const publishExtension = (
    args: PublishExtensionArgs,
  ): Effect.Effect<PublishExtensionResponse, AppError> => {
    const networkHowToFix = buildNetworkHowToFix(baseUrl);
    const networkDiagnosisDetails = buildNetworkDiagnosis(baseUrl);

    // Build FormData for multipart upload
    const formData = new FormData();
    formData.append(
      "archive",
      new Blob([args.archive], { type: "application/zip" }),
      "archive.zip",
    );
    formData.append("integrity", args.metadata.integrity);

    // Assertion needed: FormData is the correct runtime type but the generated client
    // types the payload as the schema type; bodyFormData casts to any internally
    /* eslint-disable @typescript-eslint/consistent-type-assertions */
    const payload =
      formData as unknown as GeneratedRegistryClient.ExtensionsPublishVersionRequestFormData;
    /* eslint-enable @typescript-eslint/consistent-type-assertions */

    return client
      .ExtensionsPublishVersion(args.handle, pluralizeType(args.type), args.name, args.version, {
        payload,
        config: undefined,
      })
      .pipe(
        Effect.map(() => ({ published: true as const })),
        // Single mapError handler for all error types to avoid error channel narrowing issues
        Effect.mapError((e) => mapPublishError(e, networkHowToFix, networkDiagnosisDetails)),
      );
  };

  /**
   * Map all publish error types to AppError.
   * Uses tag-based dispatch to handle each RegistryClientError variant.
   */
  const mapPublishError = (
    e: unknown,
    networkHowToFix: string,
    networkDiagnosisDetails: ReadonlyArray<string>,
  ): AppError => {
    // HttpClientError — network error
    if (isHttpClientError(e)) {
      return makeAppError({
        code: "REGISTRY_PUBLISH_NETWORK_ERROR",
        what: "Failed to connect to the remote registry",
        details: [...networkDiagnosisDetails, e.message],
        howToFix: networkHowToFix,
        cause: e,
      });
    }

    // 401 — unauthenticated
    if (isRegistryClientError("ExtensionsPublishVersion401")(e)) {
      return mapAuthUnauthenticated(e, "Session expired. Run `axm login` to re-authenticate.");
    }

    // 403 — check quota_exceeded vs generic unauthorized
    if (isRegistryClientError("ExtensionsPublishVersion403")(e)) {
      const code = getErrorCode(e);
      if (Option.isSome(code) && code.value === "quota_exceeded") {
        return makeAppError({
          code: "REGISTRY_PUBLISH_QUOTA_EXCEEDED",
          what: "Storage quota exceeded",
          details: buildErrorDetails(e),
          howToFix: "Storage quota exceeded for this extension",
          cause: e,
        });
      }
      return mapAuthUnauthorized(e);
    }

    // 409 — conflict
    if (isRegistryClientError("ExtensionsPublishVersion409")(e)) {
      return makeAppError({
        code: "REGISTRY_PUBLISH_CONFLICT",
        what: "Version already exists with different content",
        details: buildErrorDetails(e),
        howToFix:
          "This version already exists with different content. Bump the version in your manifest.",
        cause: e,
      });
    }

    // 400 — invalid archive or other bad request
    if (isRegistryClientError("ExtensionsPublishVersion400")(e)) {
      const code = getErrorCode(e);
      if (
        Option.isSome(code) &&
        (code.value === "malformed_archive" || code.value === "empty_archive")
      ) {
        return makeAppError({
          code: "REGISTRY_PUBLISH_INVALID_ARCHIVE",
          what: "Invalid extension archive",
          details: buildErrorDetails(e),
          howToFix: "Check the extension directory and rebuild",
          cause: e,
        });
      }
      return makeAppError({
        code: "REGISTRY_PUBLISH_FAILED",
        what: "Publish request failed",
        details: buildErrorDetails(e),
        cause: e,
      });
    }

    // 413 — too large
    if (isRegistryClientError("ExtensionsPublishVersion413")(e)) {
      return makeAppError({
        code: "REGISTRY_PUBLISH_TOO_LARGE",
        what: "Extension archive exceeds size limit",
        details: buildErrorDetails(e),
        howToFix: "Reduce archive size or remove unnecessary files",
        cause: e,
      });
    }

    // 415 — unsupported content type
    if (isRegistryClientError("ExtensionsPublishVersion415")(e)) {
      return makeAppError({
        code: "REGISTRY_PUBLISH_INVALID_ARCHIVE",
        what: "Unsupported archive content type",
        details: buildErrorDetails(e),
        cause: e,
      });
    }

    // 422 — integrity mismatch or manifest invalid
    if (isRegistryClientError("ExtensionsPublishVersion422")(e)) {
      const code = getErrorCode(e);
      if (Option.isSome(code) && code.value === "integrity_mismatch") {
        return makeAppError({
          code: "REGISTRY_PUBLISH_INTEGRITY_MISMATCH",
          what: "Archive integrity does not match",
          details: buildErrorDetails(e),
          cause: e,
        });
      }
      if (Option.isSome(code) && code.value.startsWith("manifest_")) {
        return makeAppError({
          code: "REGISTRY_PUBLISH_MANIFEST_INVALID",
          what: "Extension manifest validation failed",
          details: buildErrorDetails(e),
          howToFix: "Check your extension manifest",
          cause: e,
        });
      }
      return makeAppError({
        code: "REGISTRY_PUBLISH_FAILED",
        what: "Publish request failed with validation error",
        details: buildErrorDetails(e),
        cause: e,
      });
    }

    // 429 — throttled
    if (isRegistryClientError("ExtensionsPublishVersion429")(e)) {
      const retryAfter = getRetryAfterSeconds(e);
      const retryMsg = Option.match(retryAfter, {
        onNone: () => "Rate limited. Try again later.",
        onSome: (seconds) => `Rate limited. Retry after ${String(seconds)} seconds.`,
      });
      return makeAppError({
        code: "REGISTRY_PUBLISH_THROTTLED",
        what: "Publish request was rate limited",
        details: buildErrorDetails(e),
        howToFix: retryMsg,
        cause: e,
      });
    }

    // 501 — type not supported
    if (isRegistryClientError("ExtensionsPublishVersion501")(e)) {
      return makeAppError({
        code: "REGISTRY_PUBLISH_TYPE_NOT_SUPPORTED",
        what: "Extension type is not supported for publishing",
        details: buildErrorDetails(e),
        cause: e,
      });
    }

    // 503 — publishing disabled
    if (isRegistryClientError("ExtensionsPublishVersion503")(e)) {
      return makeAppError({
        code: "REGISTRY_PUBLISH_DISABLED",
        what: "Publishing is temporarily disabled",
        details: buildErrorDetails(e),
        howToFix: "Publishing is temporarily disabled. Try again later.",
        cause: e,
      });
    }

    // SchemaError
    if (isSchemaError(e)) {
      return mapSchemaError(e, "REGISTRY_PUBLISH_FAILED", "Publish response decode failed");
    }

    // Fallback — try to extract details if it's a RegistryClientError
    if (isAnyRegistryClientError(e)) {
      return makeAppError({
        code: "REGISTRY_PUBLISH_FAILED",
        what: "Publish failed",
        details: buildErrorDetails(e),
        cause: e,
      });
    }

    return makeAppError({
      code: "REGISTRY_PUBLISH_FAILED",
      what: "Publish failed",
      cause: e,
    });
  };

  return {
    getExtensionIndex,
    getExtensionsByScope,
    profileExists,
    getExtensionPackage,
    publishExtension,
    extensionExists,
  };
};
