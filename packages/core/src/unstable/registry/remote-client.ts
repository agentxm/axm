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
import { parseFullyQualifiedRefParts } from "../extensions/common.js";
import {
  decodeExtensionNameSync,
  toAuthor,
  ExtensionTypeSchema,
  type ExtensionType,
} from "../extensions/index.js";
import { decodeHandleSync, type Handle } from "../extensions/handle.js";
import { purlMatch } from "../packaging/purl-match.js";
import { ExtensionIndexSchema, type ExtensionIndex } from "./schema.js";
import type { DiscoverExtensionEntry } from "./discover-schema.js";
import { pluralizeType, resolveVersionEntry } from "./utils.js";
import type {
  DiscoverExtensionsArgs,
  ExtensionExistsArgs,
  ExtensionExistsResponse,
  GetExtensionIndexArgs,
  GetExtensionPackageArgs,
  GetExtensionPackageResponse,
  GetExtensionsByOwnerArgs,
  GetExtensionsByOwnerResponse,
  OwnerExistsResponse,
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
  ExtensionsListByOwner200,
  SearchSearchExtensions200,
} from "./__generated__/registry-client.js";

// -----------------------------------------------------------------------------
// Type Mapping Helpers
// -----------------------------------------------------------------------------

const decodeExtensionType = Schema.decodeUnknownSync(ExtensionTypeSchema);
const decodeExtensionIndex = Schema.decodeUnknownSync(ExtensionIndexSchema);

/**
 * Narrow a string to ExtensionType via Schema validation.
 * The generated client uses a wider union than our domain type;
 * this validates the value is within our supported subset.
 */
const narrowExtensionType = (type: string): ExtensionType => decodeExtensionType(type);

/**
 * Map the generated ExtensionsGet200 response to our domain ExtensionIndex type.
 */
const mapToExtensionIndex = (response: ExtensionsGet200): ExtensionIndex =>
  decodeExtensionIndex({
    name: response.name,
    owner: response.owner,
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
      compatiblePackages:
        v.compatiblePackages === null || v.compatiblePackages === undefined
          ? undefined
          : v.compatiblePackages,
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
    owner: index.owner,
    type: index.type,
    name: index.name,
    description: Option.fromUndefinedOr(index.description),
    repository: Option.fromUndefinedOr(index.repository),
    license: Option.fromUndefinedOr(index.license),
    authors: index.authors === undefined ? [] : index.authors.map((author) => toAuthor(author)),
    dependencies: latest.dependencies ?? {},
    version: latest.version,
    integrity: latest.integrity,
    compatiblePackages: latest.compatiblePackages ?? [],
  });
};

const optionToArray = <A>(option: Option.Option<A>): ReadonlyArray<A> =>
  Option.match(option, {
    onNone: () => [],
    onSome: (value) => [value],
  });

const indexToDiscoverEntry = (index: ExtensionIndex): Option.Option<DiscoverExtensionEntry> => {
  const [latestVersion] = index.versions;
  if (latestVersion === undefined) {
    return Option.none();
  }

  return Option.some({
    type: index.type,
    name: index.name,
    owner: index.owner,
    description: index.description ?? "",
    latestVersion: latestVersion.version,
  });
};

const remoteDiscoverableTypes: ReadonlyArray<ExtensionType> = [
  "skill",
  "command",
  "mcp-server",
  "subagent",
] as const;

const isRemoteDiscoverableType = (type: ExtensionType): boolean =>
  remoteDiscoverableTypes.includes(type);

type SearchCatalogHit = SearchSearchExtensions200["extensions"][number];

const isSearchCatalogHitDiscoverable = (
  hit: SearchCatalogHit,
): hit is SearchCatalogHit & { readonly type: (typeof remoteDiscoverableTypes)[number] } =>
  hit.type === "skill" ||
  hit.type === "command" ||
  hit.type === "mcp-server" ||
  hit.type === "subagent";

const decodeSearchCatalogHit = (
  hit: SearchCatalogHit,
): Effect.Effect<GetExtensionIndexArgs, AppError> =>
  Effect.try({
    try: () => ({
      owner: decodeHandleSync(hit.owner),
      type: hit.type,
      name: decodeExtensionNameSync(hit.name),
    }),
    catch: (cause) =>
      makeAppError({
        code: "REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE",
        what: "Remote discovery response does not match expected schema",
        cause,
      }),
  });

// -----------------------------------------------------------------------------
// Remote Registry Client
// -----------------------------------------------------------------------------

const remoteDiscoveryTypes: ReadonlyArray<ExtensionType> = [
  "skill",
  "command",
  "mcp-server",
  "subagent",
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
    client.ExtensionsGet(args.owner, pluralizeType(args.type), args.name, undefined).pipe(
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
    args: GetExtensionsByOwnerArgs,
  ): Effect.Effect<GetExtensionsByOwnerResponse, AppError> =>
    Effect.gen(function* () {
      let allExtensions: ReadonlyArray<RegistryExtensionManifest>;
      const owner = args.owner;

      if (args.names.length === 0 || owner === "*") {
        // List mode: fetch owner listing, then fan-out to get full indexes
        allExtensions = yield* getListModeExtensions(args);
        if (args.names.length > 0) {
          const nameSet = new Set(args.names);
          const requestedTypes = new Set(args.types);
          allExtensions = allExtensions.filter(
            (entry) =>
              nameSet.has(entry.name) &&
              (requestedTypes.size === 0 || requestedTypes.has(entry.type)),
          );
        }
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
                Effect.sync(() => {
                  try {
                    return decodeExtensionNameSync(name);
                  } catch {
                    return undefined;
                  }
                }).pipe(
                  Effect.flatMap((decodedName) =>
                    decodedName === undefined
                      ? Effect.succeed(Option.none<ExtensionIndex>())
                      : getExtensionIndex({
                          owner,
                          type,
                          name: decodedName,
                        }),
                  ),
                ),
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
    args: GetExtensionsByOwnerArgs,
  ): Effect.Effect<ReadonlyArray<RegistryExtensionManifest>, AppError> =>
    Effect.gen(function* () {
      // Fetch extension lists by type
      const listResults =
        args.types.length === 0
          ? [yield* fetchExtensionList(args.owner)]
          : yield* Effect.forEach(
              args.types,
              (type) => fetchExtensionListByType(args.owner, type),
              { concurrency: "unbounded" },
            );

      const summaries = listResults.flat();

      // Fetch full indexes for each extension
      const maybeEntries = yield* Effect.forEach(
        summaries,
        (summary) =>
          getExtensionIndex({
            owner: decodeHandleSync(summary.owner),
            type: narrowExtensionType(summary.type),
            name: decodeExtensionNameSync(summary.name),
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
        if (a.owner !== b.owner) return a.owner.localeCompare(b.owner);
        if (a.name !== b.name) return a.name.localeCompare(b.name);
        return a.type.localeCompare(b.type);
      });

      return sorted;
    });

  const fetchExtensionList = (
    owner: Handle | "*",
  ): Effect.Effect<ExtensionsListByOwner200["extensions"], AppError> =>
    client.ExtensionsListByOwner(owner, undefined).pipe(
      Effect.map((response) => response.extensions),
      mapDiscoveryErrors,
    );

  const fetchExtensionListByType = (
    owner: Handle | "*",
    type: ExtensionType,
  ): Effect.Effect<ExtensionsListByOwner200["extensions"], AppError> =>
    client.ExtensionsListByType(owner, pluralizeType(type), undefined).pipe(
      Effect.map((response) => response.extensions),
      mapDiscoveryErrors,
    );

  /**
   * Shared error mapping for discovery (list/search) operations.
   */
  const mapDiscoveryErrors = <A>(effect: Effect.Effect<A, unknown>): Effect.Effect<A, AppError> =>
    effect.pipe(Effect.mapError((e) => mapDiscoveryError(e, "REGISTRY_REMOTE_DISCOVERY")));

  const fetchDiscoverableCatalogHits = (): Effect.Effect<
    ReadonlyArray<SearchCatalogHit>,
    AppError
  > =>
    Effect.gen(function* () {
      const hits: Array<SearchCatalogHit> = [];
      let cursor: string | undefined;

      while (true) {
        const page = yield* mapDiscoveryErrors(
          client.SearchSearchExtensions({
            params: {
              q: "",
              limit: "100",
              ...(cursor === undefined ? {} : { cursor }),
            },
          }),
        );

        hits.push(...page.extensions.filter(isSearchCatalogHitDiscoverable));

        if (!page.has_more) {
          return hits;
        }

        if (page.cursor === null) {
          return yield* makeAppError({
            code: "REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE",
            what: "Remote discovery response does not match expected schema",
            details: ["Search pagination indicated more results but omitted the next cursor."],
          });
        }

        cursor = page.cursor;
      }
    });

  const fetchDiscoverableIndexes = (): Effect.Effect<ReadonlyArray<ExtensionIndex>, AppError> =>
    Effect.gen(function* () {
      const hits = yield* fetchDiscoverableCatalogHits();
      const maybeIndexes = yield* Effect.forEach(
        hits,
        (hit) =>
          decodeSearchCatalogHit(hit).pipe(
            Effect.flatMap((decodedHit) => getExtensionIndex(decodedHit)),
          ),
        { concurrency: "unbounded" },
      );

      return maybeIndexes.flatMap(optionToArray);
    });

  // ---------------------------------------------------------------------------
  // ownerExists
  // ---------------------------------------------------------------------------
  const ownerExists = (owner: Handle): Effect.Effect<OwnerExistsResponse, AppError> =>
    client.ExtensionsListByOwner(owner, undefined).pipe(
      Effect.map(
        (response) => ({ exists: response.extensions.length > 0 }) satisfies OwnerExistsResponse,
      ),
      Effect.catch((e) => {
        // 404 → not found
        if (hasTagSuffix(e, "404")) {
          return Effect.succeed({ exists: false } satisfies OwnerExistsResponse);
        }
        return Effect.fail(mapOwnerExistsError(e));
      }),
    );

  /**
   * Map ownerExists errors to AppError.
   */
  const mapOwnerExistsError = (e: unknown): AppError => {
    if (isHttpClientError(e)) {
      return mapNetworkError(
        e,
        "REGISTRY_REMOTE_NAMESPACE_CHECK_NETWORK_ERROR",
        "Failed to connect to remote registry owner endpoint",
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
        "Remote owner endpoint response does not match expected schema",
      );
    }
    if (isAnyRegistryClientError(e)) {
      return mapUnexpectedStatusError(
        e,
        "REGISTRY_REMOTE_NAMESPACE_CHECK_FAILED",
        "Remote owner check failed",
      );
    }
    return makeAppError({
      code: "REGISTRY_REMOTE_NAMESPACE_CHECK_FAILED",
      what: "Remote owner check failed",
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
        .ExtensionsGet(args.owner, pluralizeType(args.type), args.name, undefined)
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
          args.owner,
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
    client.ExtensionsHead(args.owner, pluralizeType(args.type), args.name, undefined).pipe(
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
      .ExtensionsPublishVersion(args.owner, pluralizeType(args.type), args.name, args.version, {
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

  // ---------------------------------------------------------------------------
  // discoverExtensions
  // ---------------------------------------------------------------------------
  const discoverExtensions = (
    args: DiscoverExtensionsArgs,
  ): Effect.Effect<
    import("./discover-schema.js").DiscoverExtensionsResponse,
    import("../app-error/index.js").AppError
  > =>
    Effect.gen(function* () {
      const indexes = yield* fetchDiscoverableIndexes();

      const results = args.packages.flatMap((detectedPackage) => {
        const matchingExtensions = indexes.flatMap((index) => {
          const [latestVersion] = index.versions;
          if (latestVersion === undefined) {
            return [];
          }

          const compatiblePackages = latestVersion.compatiblePackages ?? [];
          if (!compatiblePackages.some((declared) => purlMatch(detectedPackage, declared))) {
            return [];
          }

          return optionToArray(indexToDiscoverEntry(index));
        });

        if (matchingExtensions.length === 0) {
          return [];
        }

        return [
          {
            detectedPackage,
            extensions: matchingExtensions,
          },
        ];
      });

      const resolvedRecommendationIndexes = yield* Effect.forEach(
        args.workspaceRecommendedExtensions ?? [],
        (ref) => {
          const parsed = parseFullyQualifiedRefParts(ref);
          if (parsed === undefined || !isRemoteDiscoverableType(parsed.type)) {
            return Effect.succeed(Option.none<ExtensionIndex>());
          }

          return getExtensionIndex({
            owner: parsed.owner,
            type: parsed.type,
            name: parsed.name,
          });
        },
        { concurrency: "unbounded" },
      );

      const resolvedRecommendations = resolvedRecommendationIndexes.flatMap((index) =>
        Option.match(index, {
          onNone: () => [],
          onSome: (value) => optionToArray(indexToDiscoverEntry(value)),
        }),
      );

      return {
        results,
        resolvedRecommendations,
      };
    });

  return {
    getExtensionIndex,
    getExtensionsByScope,
    ownerExists,
    getExtensionPackage,
    publishExtension,
    extensionExists,
    discoverExtensions,
  };
};
