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
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as Schema from "effect/Schema";
import { type AppError, type AppErrorMetadata, makeAppError } from "../app-error/index.js";
import type { SuggestedAction } from "../cli-runtime/suggested-action.js";
import { parseExtensionFqnParts, toExtensionTypePlural } from "../extensions/common.js";
import {
  decodeExtensionNameSync,
  toAuthor,
  ExtensionTypeSchema,
  type ExtensionType,
} from "../extensions/index.js";
import { decodeHandleSync, type Handle } from "../extensions/handle.js";
import { CompanionPackageSchema } from "../package-urls/index.js";
import { PackageUrlSchema, type PackageUrlParts } from "../packaging/package-url.js";
import type { PackageExtensionDeclaration } from "../packaging/axm-package-meta.js";
import { packagesToPackageUrlParts, ExtensionIndexSchema, type ExtensionIndex } from "./schema.js";
import { DiscoverPackagesResponseSchema } from "./discover-schema.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { extensionLifecycleWarnings, pluralizeType, resolveVersionEntry } from "./utils.js";
import type {
  DiscoverPackagesArgs,
  ExtensionExistsArgs,
  ExtensionExistsResponse,
  GetExtensionIndexArgs,
  GetExtensionPackageArgs,
  GetExtensionPackageResponse,
  GetExtensionsByOwnerArgs,
  GetExtensionsByOwnerResponse,
  OwnerExistsResponse,
  PreviewExtensionPublishesArgs,
  PublishExtensionArgs,
  PublishExtensionResponse,
  PublishPreviewResult,
  RegistryClient,
  RegistryExtensionManifest,
  UpdateExtensionVisibilityArgs,
} from "./client.js";
import {
  isRegistryClientError,
  isHttpClientError,
  isSchemaError,
  isAnyRegistryClientError,
  hasTagSuffix,
  getTag,
  mapNetworkError,
  mapResponseSchemaError,
  mapUnexpectedStatusError,
  buildNetworkSuggestions,
  buildNetworkDiagnosis,
} from "./error-mapping.js";
import { registryClientErrorToAppError } from "./translate.js";
import * as GeneratedRegistryClient from "./__generated__/registry-client.js";
import type {
  ExtensionsGet200,
  ExtensionsListByOwner200,
} from "./__generated__/registry-client.js";
import type { ArchiveCache } from "./archive-cache.js";

// -----------------------------------------------------------------------------
// Type Mapping Helpers
// -----------------------------------------------------------------------------

const decodeExtensionType = Schema.decodeUnknownSync(ExtensionTypeSchema);
const decodeExtensionIndex = Schema.decodeUnknownSync(Schema.toType(ExtensionIndexSchema));
const decodeCompanionPackages = Schema.decodeUnknownSync(Schema.Array(CompanionPackageSchema));
const encodePackageUrl = Schema.encodeSync(PackageUrlSchema);

/**
 * Narrow a string to ExtensionType via Schema validation.
 * The generated client uses a wider union than our domain type;
 * this validates the value is within our supported subset.
 */
const narrowExtensionType = (type: string): ExtensionType => decodeExtensionType(type);

const mapPublishPreviewTarget = (
  target: GeneratedRegistryClient.PublishPreviewTarget,
): import("./client.js").PublishPreviewTarget => ({
  owner: decodeHandleSync(target.owner),
  type: narrowExtensionType(target.type),
  name: decodeExtensionNameSync(target.name),
  version: decodeVersionSync(target.version),
});

/**
 * Map the generated ExtensionsGet200 response to our domain ExtensionIndex type.
 *
 * Validates against the type side of ExtensionIndexSchema, so timestamps the
 * generated client already decoded to DateTime.Utc flow through without an
 * encode/re-decode round-trip. Companion packages are the one remaining
 * wire-form field (versionRange strings), so they decode via the wire schema.
 */
const mapToExtensionIndex = (response: ExtensionsGet200): ExtensionIndex =>
  decodeExtensionIndex({
    name: response.name,
    owner: response.owner,
    type: narrowExtensionType(response.type),
    publisherBindingId: response.publisher_binding_id,
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
    visibility: response.visibility ?? undefined,
    deprecatedAt: response.deprecated_at ?? undefined,
    deprecationNotice: response.deprecation_notice ?? undefined,
    versions: response.versions.map((v) => ({
      version: v.version,
      published: v.published,
      integrity: v.integrity,
      dependencies: v.dependencies === null ? undefined : v.dependencies,
      packages:
        v.packages === null || v.packages === undefined
          ? undefined
          : decodeCompanionPackages(v.packages),
      yankedAt: v.yanked_at ?? undefined,
      yankCategory: v.yank_category ?? undefined,
      yankNotice: v.yank_notice ?? undefined,
    })),
  });

/**
 * Convert an ExtensionIndex + version constraint to a RegistryExtensionManifest.
 */
const toRegistryManifest = (
  index: ExtensionIndex,
  versionRange: Option.Option<string>,
): Option.Option<RegistryExtensionManifest> => {
  const selected = resolveVersionEntry(index.versions, versionRange);
  if (Option.isNone(selected)) return Option.none();

  const latest = selected.value;
  const lifecycleWarnings = extensionLifecycleWarnings(index, latest);

  return Option.some({
    owner: index.owner,
    type: index.type,
    name: index.name,
    publisherBindingId: index.publisherBindingId,
    description: Option.fromUndefinedOr(index.description),
    repository: Option.fromUndefinedOr(index.repository),
    bugs: Option.fromUndefinedOr(index.bugs),
    license: Option.fromUndefinedOr(index.license),
    authors: index.authors === undefined ? [] : index.authors.map((author) => toAuthor(author)),
    dependencies: latest.dependencies ?? {},
    version: latest.version,
    integrity: latest.integrity,
    packages: packagesToPackageUrlParts(latest.packages),
    ...(lifecycleWarnings.length === 0 ? {} : { lifecycleWarnings }),
  });
};

// -----------------------------------------------------------------------------
// Remote Registry Client
// -----------------------------------------------------------------------------

const remoteDiscoveryTypes: ReadonlyArray<ExtensionType> = [
  "skill",
  "mcp-server",
  "subagent",
  "pack",
] as const;

const packageIdentity = (parts: PackageUrlParts): PackageUrlParts => ({
  type: parts.type,
  name: parts.name,
  ...(parts.namespace === undefined ? {} : { namespace: parts.namespace }),
  ...(parts.qualifiers === undefined ? {} : { qualifiers: parts.qualifiers }),
  ...(parts.subpath === undefined ? {} : { subpath: parts.subpath }),
});

const extensionDeclarationToDiscoveryRef = (value: PackageExtensionDeclaration) => {
  const parts = parseExtensionFqnParts(value.ref);
  if (parts === undefined) {
    return undefined;
  }

  return {
    ref: `${parts.owner}/${toExtensionTypePlural(parts.type)}/${parts.name}`,
    ...(value.versionRange === undefined || value.versionRange === null
      ? {}
      : { versionRange: value.versionRange }),
  };
};

const registryRequestMetadata = (
  method: string,
  url: string,
): NonNullable<AppErrorMetadata["request"]> => ({
  service: "registry",
  method,
  url,
});

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
  archiveCache?: ArchiveCache,
): RegistryClient => {
  const remoteHttpClient = httpClient.pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl)),
  );
  const client = GeneratedRegistryClient.make(remoteHttpClient);

  // ---------------------------------------------------------------------------
  // getExtensionIndex
  // ---------------------------------------------------------------------------
  const getExtensionIndex = (args: GetExtensionIndexArgs) =>
    client.ExtensionsGet(args.owner, pluralizeType(args.type), args.name, undefined).pipe(
      // Resolve the HTTP outcome first (404 → absent), then decode the index in
      // the effect so a schema-drift SchemaError is mapped through the error
      // channel (mapDiscoveryError's isSchemaError branch) instead of throwing
      // an uncatchable defect out of Effect.map.
      Effect.map((response) => Option.some(response)),
      Effect.catch((e) =>
        isRegistryClientError("ExtensionsGet404")(e)
          ? Effect.succeed(Option.none<ExtensionsGet200>())
          : Effect.fail(mapDiscoveryError(e, "REGISTRY_REMOTE_DISCOVERY")),
      ),
      Effect.flatMap((response) =>
        Option.isNone(response)
          ? Effect.succeed(Option.none<ExtensionIndex>())
          : Effect.try({
              try: () => Option.some(mapToExtensionIndex(response.value)),
              catch: (cause) => mapDiscoveryError(cause, "REGISTRY_REMOTE_DISCOVERY"),
            }),
      ),
    );

  /**
   * Map all discovery/read errors to AppError.
   */
  const mapDiscoveryError = (e: unknown, _prefix: string): AppError => {
    if (isHttpClientError(e)) {
      return mapNetworkError(e, "Failed to connect to remote registry discovery endpoint", baseUrl);
    }

    if (isSchemaError(e)) {
      return mapResponseSchemaError(e, "Remote discovery response does not match expected schema");
    }

    if (isAnyRegistryClientError(e)) {
      return mapUnexpectedStatusError(e, "Remote discovery failed");
    }

    return makeAppError({
      code: "internal",
      detail: "Remote discovery failed",
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

  // ---------------------------------------------------------------------------
  // ownerExists
  // ---------------------------------------------------------------------------
  const ownerExists = (owner: Handle): Effect.Effect<OwnerExistsResponse, AppError> =>
    client.OwnersGetOwner(owner, undefined).pipe(
      Effect.as({ exists: true } satisfies OwnerExistsResponse),
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
      return mapNetworkError(e, "Failed to connect to remote registry owner endpoint", baseUrl);
    }

    if (isSchemaError(e)) {
      return mapResponseSchemaError(
        e,
        "Remote owner endpoint response does not match expected schema",
      );
    }
    if (isAnyRegistryClientError(e)) {
      return mapUnexpectedStatusError(e, "Remote owner check failed");
    }
    return makeAppError({
      code: "network",
      detail: "Remote owner check failed",
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

      const index = yield* Effect.try({
        try: () => mapToExtensionIndex(indexResult),
        catch: (cause) => mapDiscoveryError(cause, "REGISTRY_REMOTE_DISCOVERY"),
      });

      // Step 2: Resolve version
      const resolvedEntry = resolveVersionEntry(index.versions, args.version);

      if (Option.isNone(resolvedEntry)) {
        return yield* makeAppError({
          code: "not_found",
          detail: "Requested package version is not available in remote index",
        });
      }

      if (archiveCache !== undefined) {
        const cached = yield* archiveCache.read(resolvedEntry.value.integrity);
        if (Option.isSome(cached)) {
          const warnings = extensionLifecycleWarnings(index, resolvedEntry.value);
          return {
            archive: cached.value,
            ...(warnings.length === 0 ? {} : { warnings }),
          } satisfies GetExtensionPackageResponse;
        }
      }

      // Step 3: Download archive
      const archive = yield* client
        .ExtensionsDownloadArchive(
          args.owner,
          pluralizeType(args.type),
          args.name,
          resolvedEntry.value.version,
          undefined,
        )
        .pipe(Effect.mapError((e) => mapArchiveFetchError(e)));

      if (archiveCache !== undefined) {
        yield* archiveCache.write(resolvedEntry.value.integrity, archive);
      }

      const warnings = extensionLifecycleWarnings(index, resolvedEntry.value);
      return {
        archive,
        ...(warnings.length === 0 ? {} : { warnings }),
      } satisfies GetExtensionPackageResponse;
    });

  /**
   * Map errors from the index fetch step of getExtensionPackage.
   */
  const mapPackageFetchError = (e: unknown): AppError => {
    if (isRegistryClientError("ExtensionsGet404")(e)) {
      return makeAppError({
        code: "not_found",
        detail: "Remote package index was not found",
      });
    }
    if (isHttpClientError(e)) {
      return mapNetworkError(e, "Failed to connect to remote registry package endpoint", baseUrl);
    }
    if (isSchemaError(e)) {
      return mapResponseSchemaError(
        e,
        "Remote package index response does not match expected schema",
      );
    }
    if (isAnyRegistryClientError(e)) {
      return mapUnexpectedStatusError(e, "Remote package index request failed");
    }
    return makeAppError({
      code: "network",
      detail: "Remote package index request failed",
      cause: e,
    });
  };

  /**
   * Map errors from the archive download step of getExtensionPackage.
   */
  const mapArchiveFetchError = (e: unknown): AppError => {
    if (isRegistryClientError("ExtensionsDownloadArchive404")(e) || getTag(e) === "404") {
      return makeAppError({
        code: "not_found",
        detail: "Remote package archive was not found",
      });
    }
    if (isHttpClientError(e)) {
      return mapNetworkError(
        e,
        "Failed to connect to remote registry package archive endpoint",
        baseUrl,
      );
    }
    if (isSchemaError(e)) {
      return mapResponseSchemaError(e, "Failed to read remote package archive response");
    }
    if (isAnyRegistryClientError(e)) {
      return mapUnexpectedStatusError(e, "Remote package archive request failed");
    }
    return makeAppError({
      code: "network",
      detail: "Remote package archive request failed",
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
        "Failed to connect to remote registry extension check endpoint",
        baseUrl,
      );
    }
    if (isAnyRegistryClientError(e)) {
      return mapUnexpectedStatusError(e, "Remote extension check failed");
    }
    return makeAppError({
      code: "network",
      detail: "Remote extension check failed",
      cause: e,
    });
  };

  // ---------------------------------------------------------------------------
  // publishExtension
  // ---------------------------------------------------------------------------
  const publishExtension = (
    args: PublishExtensionArgs,
  ): Effect.Effect<PublishExtensionResponse, AppError> => {
    const networkSuggestions = buildNetworkSuggestions(baseUrl);
    const networkDiagnosisDetails = buildNetworkDiagnosis(baseUrl);
    const publishRequest = registryRequestMetadata(
      "PUT",
      new URL(
        `/v1/extensions/${args.owner}/${pluralizeType(args.type)}/${args.name}/${args.version}`,
        baseUrl,
      ).href,
    );

    const contentDigest = args.metadata.integrity.startsWith("sha512-")
      ? `sha-512=:${args.metadata.integrity.slice("sha512-".length)}:`
      : args.metadata.integrity;
    const publishClient = GeneratedRegistryClient.make(remoteHttpClient, {
      transformClient: (baseClient) =>
        Effect.succeed(
          baseClient.pipe(
            HttpClient.mapRequest((request) => {
              const archiveRequest = request.pipe(
                HttpClientRequest.bodyUint8Array(args.archive, "application/zip"),
                HttpClientRequest.setHeaders({
                  "content-digest": contentDigest,
                  "content-length": String(args.archive.byteLength),
                }),
              );
              return args.accessToken === undefined
                ? archiveRequest
                : HttpClientRequest.bearerToken(archiveRequest, args.accessToken);
            }),
          ),
        ),
    });

    return publishClient
      .ExtensionsPublishVersion(
        args.owner,
        pluralizeType(args.type),
        args.name,
        args.version,
        args.initialVisibility === undefined && args.condition === undefined
          ? undefined
          : {
              params: {
                ...(args.initialVisibility === undefined
                  ? {}
                  : { visibility: args.initialVisibility }),
                ...(args.condition === undefined ? {} : { "if-match": args.condition }),
              },
            },
      )
      .pipe(
        Effect.map(
          (response) =>
            ({
              published: true,
              owner: decodeHandleSync(response.owner),
              type: narrowExtensionType(response.type),
              name: decodeExtensionNameSync(response.name),
              version: decodeVersionSync(response.version),
              integrity: response.integrity,
              status: response.publish_status,
              visibility: response.visibility,
              links: response.links,
            }) satisfies PublishExtensionResponse,
        ),
        // Single mapError handler for all error types to avoid error channel narrowing issues
        Effect.mapError((e) =>
          mapPublishError(e, networkSuggestions, networkDiagnosisDetails, publishRequest),
        ),
      );
  };

  const previewExtensionPublishes = (
    args: PreviewExtensionPublishesArgs,
  ): Effect.Effect<ReadonlyArray<PublishPreviewResult>, AppError> =>
    client
      .PublishPreviewsPreviewExtensionPublishes({
        payload: {
          candidates: args.candidates,
          ...(args.initialVisibility === undefined ? {} : { visibility: args.initialVisibility }),
        },
        config: undefined,
      })
      .pipe(
        Effect.map((response) =>
          response.map((item): PublishPreviewResult =>
            item.kind === "unavailable"
              ? {
                  kind: "unavailable",
                  target: mapPublishPreviewTarget(item.target),
                  code: item.code,
                }
              : {
                  kind: "resolved",
                  target: mapPublishPreviewTarget(item.target),
                  visibility: item.visibility,
                  condition: item.condition,
                },
          ),
        ),
        Effect.mapError((error) => {
          if (isHttpClientError(error)) {
            if (error.reason._tag === "StatusCodeError") {
              return makeAppError({
                code: "internal",
                detail: "The registry is incompatible with authoritative publish previews.",
                cause: error,
              });
            }
            return mapNetworkError(
              error,
              "Failed to connect to the publish preview endpoint",
              baseUrl,
            );
          }
          if (isSchemaError(error)) {
            return makeAppError({
              code: "internal",
              detail: "The registry is incompatible with authoritative publish previews.",
              cause: error,
            });
          }
          if (isAnyRegistryClientError(error)) {
            if (getTag(error) === "PublishPreviewsPreviewExtensionPublishes413") {
              return registryClientErrorToAppError(error);
            }
            if (
              getTag(error) === "PublishPreviewsPreviewExtensionPublishes401" ||
              getTag(error) === "PublishPreviewsPreviewExtensionPublishes403"
            ) {
              return registryClientErrorToAppError(error);
            }
            return makeAppError({
              code: "internal",
              detail: "The registry is incompatible with authoritative publish previews.",
              cause: error,
            });
          }
          return makeAppError({
            code: "internal",
            detail: "Publish preview failed",
            cause: error,
          });
        }),
      );

  const updateExtensionVisibility = (
    args: UpdateExtensionVisibilityArgs,
  ): Effect.Effect<void, AppError> =>
    client
      .ExtensionsUpdateVisibility(args.owner, pluralizeType(args.type), args.name, {
        payload: { visibility: args.visibility },
        config: undefined,
      })
      .pipe(
        Effect.asVoid,
        Effect.mapError((error) =>
          isHttpClientError(error)
            ? mapNetworkError(error, "Failed to connect to extension visibility endpoint", baseUrl)
            : isAnyRegistryClientError(error)
              ? registryClientErrorToAppError(error)
              : makeAppError({
                  code: "network",
                  detail: "Remote extension visibility update failed",
                  cause: error,
                }),
        ),
      );

  /**
   * Map all publish error types to AppError.
   * Uses tag-based dispatch to handle each RegistryClientError variant.
   */
  const mapPublishError = (
    e: unknown,
    networkSuggestions: ReadonlyArray<SuggestedAction>,
    _networkDiagnosisDetails: ReadonlyArray<string>,
    publishRequest: NonNullable<AppErrorMetadata["request"]>,
  ): AppError => {
    // HttpClientError — network error
    if (isHttpClientError(e)) {
      return makeAppError({
        code: "network",
        detail: "Remote registry is unreachable",
        metadata: {
          request: registryRequestMetadata(e.request.method, e.request.url),
        },
        suggestions: networkSuggestions,
        cause: e,
      });
    }

    if (isSchemaError(e)) {
      return makeAppError({
        code: "internal",
        detail: "The registry returned a response the CLI could not parse.",
        metadata: {
          request: publishRequest,
        },
        suggestions: [
          {
            description:
              "The registry may be misconfigured or running a version incompatible with this CLI.",
          },
          { description: "Re-run with --verbose to inspect the raw response." },
          {
            description: "If this persists, report it.",
            url: "https://github.com/agentxm/axm/issues",
          },
        ],
        cause: e,
      });
    }

    if (isAnyRegistryClientError(e)) {
      return registryClientErrorToAppError(e);
    }

    return makeAppError({
      code: "internal",
      detail: "Publish failed",
      cause: e,
    });
  };

  // ---------------------------------------------------------------------------
  // discoverPackages
  // ---------------------------------------------------------------------------
  const discoverPackages = (
    args: DiscoverPackagesArgs,
  ): Effect.Effect<
    import("./discover-schema.js").DiscoverPackagesResponse,
    import("../app-error/index.js").AppError
  > => {
    const payload = {
      client: { axmVersion: "0.0.0" },
      packages: args.packages.map((pkg) => ({
        purl: encodePackageUrl(packageIdentity(pkg.purl)),
        version: pkg.version,
        declaredExtensions: pkg.declaredExtensions.flatMap((entry) => {
          const ref = extensionDeclarationToDiscoveryRef(entry);
          return ref === undefined ? [] : [ref];
        }),
      })),
    };

    return HttpClientRequest.post("/v1/discovery").pipe(
      HttpClientRequest.bodyJsonUnsafe(payload),
      remoteHttpClient.execute,
      Effect.flatMap(
        HttpClientResponse.matchStatus({
          "2xx": HttpClientResponse.schemaBodyJson(DiscoverPackagesResponseSchema),
          orElse: (response) =>
            Effect.fail(
              makeAppError({
                code: "network",
                detail: `Remote discovery failed with HTTP ${response.status}`,
                metadata: {
                  request: registryRequestMetadata(response.request.method, response.request.url),
                  response: {
                    status: response.status,
                  },
                },
              }),
            ),
        }),
      ),
      Effect.mapError((e) =>
        isHttpClientError(e) || isSchemaError(e)
          ? mapDiscoveryError(e, "REGISTRY_REMOTE_DISCOVERY")
          : isAnyRegistryClientError(e)
            ? registryClientErrorToAppError(e)
            : mapDiscoveryError(e, "REGISTRY_REMOTE_DISCOVERY"),
      ),
    );
  };

  return {
    getExtensionIndex,
    getExtensionsByScope,
    ownerExists,
    getExtensionPackage,
    publishExtension,
    previewExtensionPublishes,
    updateExtensionVisibility,
    extensionExists,
    discoverPackages,
  };
};
