// @effect-diagnostics anyUnknownInErrorContext:off — generated HTTP response errors are translated to typed registry failures by this registry adapter
/**
 * Remote HTTPS registry client.
 *
 * Implements `RegistryClient` by delegating HTTP transport to the generated
 * registry client and mapping all errors to the typed registry failure
 * vocabulary with per-operation categories.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Headers from "effect/unstable/http/Headers";
import * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as MutableRef from "effect/MutableRef";
import * as Stream from "effect/Stream";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as Schema from "effect/Schema";
import {
  sanitizeSuggestedAction,
  type SuggestedAction,
} from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  parseExtensionFqnParts,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import {
  decodeExtensionNameSync,
  toAuthor,
  ExtensionTypeSchema,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { CompanionPackageSchema } from "@agentxm/extension-model/unstable/package-urls";
import {
  PackageUrlSchema,
  type PackageUrlParts,
} from "@agentxm/extension-model/unstable/packaging/package-url";
import type { PackageExtensionDeclaration } from "./axm-package-meta.js";
import {
  packagesToPackageUrlParts,
  ExtensionIndexSchema,
  type ExtensionIndex,
} from "@agentxm/registry-protocol/unstable/registry/schema";
import { DiscoverPackagesResponseSchema } from "@agentxm/registry-protocol/unstable/registry/discover-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { extensionLifecycleWarnings, pluralizeType, resolveVersionEntry } from "./utils.js";
import type {
  DiscoverPackagesArgs,
  ExtensionExistsArgs,
  ExtensionExistsResponse,
  ExactExtensionVersion,
  GetExactExtensionVersionArgs,
  GetExtensionIndexArgs,
  GetExtensionPackageArgs,
  GetExtensionPackageResponse,
  GetExtensionVisibilityArgs,
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
import { isRegistryClientError, hasTagSuffix, getTag } from "./error-mapping.js";
import {
  RegistryOperationFailed,
  RegistryRequestFailed,
  withRegistrySemantics,
  type RegistryClientFailure,
  type RegistryRequestMetadata,
} from "./errors.js";
import { captureRegistryErrorResponseBodies, mapRegistryFailure } from "./failure-mapping.js";
import {
  executeRegistryRequest,
  PUBLISH_REGISTRY_REQUEST_POLICY,
  type RegistryRequestPolicy,
  type RegistryRequestReplaySafety,
} from "./request-policy.js";
import * as GeneratedRegistryClient from "./__generated__/registry-client.js";
import type {
  ExtensionsGet200,
  ExtensionsListByOwner200,
} from "./__generated__/registry-client.js";

// Reuse the established four-request cap from publish transport. Named and
// list discovery share the same registry service and must not multiply it via
// nested traversals.
const REGISTRY_READ_CONCURRENCY = 4;
const SETTLEMENT_READ_REQUEST_POLICY: RegistryRequestPolicy = {
  requestTimeout: "10 seconds",
  totalDeadline: "10 seconds",
  maxAttempts: 1,
  initialBackoff: "200 millis",
  maxBackoff: "2 seconds",
};
import type { ArchiveCache } from "./archive-cache.js";
import {
  PreviewPublicationSetResponseSchema,
  validatePublicationDescriptors,
  validatePublicationSetResponse,
} from "@agentxm/registry-protocol/unstable/registry/publication-set";

// -----------------------------------------------------------------------------
// Type Mapping Helpers
// -----------------------------------------------------------------------------

const decodeExtensionType = Schema.decodeUnknownSync(ExtensionTypeSchema);
const decodeExtensionIndex = Schema.decodeUnknownSync(Schema.toType(ExtensionIndexSchema));
const decodeCompanionPackages = Schema.decodeUnknownSync(Schema.Array(CompanionPackageSchema));
const encodePackageUrl = Schema.encodeSync(PackageUrlSchema);

const normalizeRegistrySuggestedAction = (suggestion: {
  readonly description: string;
  readonly cmd?: string | null;
  readonly url?: string | null;
}): SuggestedAction =>
  sanitizeSuggestedAction({
    description: suggestion.description,
    ...(suggestion.cmd === undefined || suggestion.cmd === null ? {} : { cmd: suggestion.cmd }),
    ...(suggestion.url === undefined || suggestion.url === null ? {} : { url: suggestion.url }),
  });

/**
 * Narrow a string to ExtensionType via Schema validation.
 * The generated client uses a wider union than our domain type;
 * this validates the value is within our supported subset.
 */
const narrowExtensionType = (type: string): ExtensionType => decodeExtensionType(type);

const decodePublicationSetResponse = Schema.decodeUnknownSync(PreviewPublicationSetResponseSchema);
const encodePublicationSetRequest = (args: PreviewExtensionPublishesArgs) => ({
  contract: args.contract,
  candidates: args.candidates.map((descriptor) => ({
    target: descriptor.target,
    participation: descriptor.participation,
    ...(descriptor.archiveSha256Hex === undefined
      ? {}
      : { archiveSha256Hex: descriptor.archiveSha256Hex }),
    visibility: descriptor.visibility,
    ...(descriptor.pack === undefined ? {} : { pack: descriptor.pack }),
  })),
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
    deprecation:
      response.deprecation === null
        ? null
        : response.deprecation.message !== undefined && response.deprecation.message !== null
          ? {
              deprecatedAt: response.deprecation.deprecatedAt,
              message: response.deprecation.message,
              ...(response.deprecation.replacement === undefined ||
              response.deprecation.replacement === null
                ? {}
                : {
                    replacement:
                      response.deprecation.replacement.status === "available"
                        ? response.deprecation.replacement
                        : {
                            status: "unavailable" as const,
                            ...(response.deprecation.replacement.fqn === undefined ||
                            response.deprecation.replacement.fqn === null
                              ? {}
                              : { fqn: response.deprecation.replacement.fqn }),
                          },
                  }),
            }
          : {
              deprecatedAt: response.deprecation.deprecatedAt,
              replacement:
                response.deprecation.replacement?.status === "available"
                  ? response.deprecation.replacement
                  : {
                      status: "unavailable" as const,
                      ...(response.deprecation.replacement?.fqn === undefined ||
                      response.deprecation.replacement.fqn === null
                        ? {}
                        : { fqn: response.deprecation.replacement.fqn }),
                    },
            },
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
    ...(index.deprecation === null ? {} : { deprecation: index.deprecation }),
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

const contentLength = (response: HttpClientResponse.HttpClientResponse): number | undefined =>
  Option.match(Headers.get(response.headers, "content-length"), {
    onNone: () => undefined,
    onSome: (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    },
  });

/**
 * Stream one archive body into memory, reporting received bytes per chunk.
 * Non-2xx statuses fail as `HttpClientError` so the caller's mapping keeps
 * the response evidence.
 */
const downloadArchive = (
  http: HttpClient.HttpClient,
  path: string,
  onProgress: GetExtensionPackageArgs["onProgress"],
): Effect.Effect<Uint8Array, HttpClientError.HttpClientError> =>
  Effect.gen(function* () {
    const response = yield* HttpClient.filterStatusOk(http).execute(HttpClientRequest.get(path));
    const total = contentLength(response);
    const received = MutableRef.make(0);
    const report = onProgress ?? (() => Effect.void);
    const chunks = yield* response.stream.pipe(
      Stream.tap((chunk) =>
        report({
          done: MutableRef.updateAndGet(received, (done) => done + chunk.byteLength),
          ...(total === undefined ? {} : { total }),
        }),
      ),
      Stream.runCollect,
    );
    const archive = new Uint8Array(MutableRef.get(received));
    let offset = 0;
    for (const chunk of chunks) {
      archive.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return archive;
  });

const registryRequestMetadata = (method: string, url: string): RegistryRequestMetadata => ({
  service: "registry",
  method,
  url,
});

/**
 * Creates a remote HTTPS registry client.
 *
 * Uses the generated registry client for all HTTP transport and maps
 * generated errors to typed registry failure categories per-operation.
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
  requestPolicy?: RegistryRequestPolicy,
): RegistryClient => {
  const remoteHttpClient = captureRegistryErrorResponseBodies(
    httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl))),
  );
  const client = GeneratedRegistryClient.make(remoteHttpClient);
  const verificationHttpClient = remoteHttpClient.pipe(
    HttpClient.mapRequest(HttpClientRequest.setHeader("x-agentxm-usage-purpose", "verification")),
  );
  const executeRemoteRequest = <A, E>(
    effect: Effect.Effect<A, E>,
    args: {
      readonly operation: string;
      readonly method: string;
      readonly path: string;
      readonly replaySafety: RegistryRequestReplaySafety;
      readonly mapError: (error: E) => RegistryClientFailure;
      readonly policy?: RegistryRequestPolicy;
    },
  ) =>
    executeRegistryRequest(effect, {
      operation: args.operation,
      request: registryRequestMetadata(args.method, new URL(args.path, baseUrl).href),
      replaySafety: args.replaySafety,
      mapError: args.mapError,
      ...(requestPolicy === undefined && args.policy === undefined
        ? {}
        : { policy: requestPolicy ?? args.policy }),
    });
  const safe = { kind: "safe" } as const;
  const mutation = { kind: "mutation" } as const;
  const mapFailure = (
    error: unknown,
    context: {
      readonly networkDetail: string;
      readonly incompatibleDetail: string;
      readonly fallbackDetail: string;
    },
  ): RegistryClientFailure =>
    mapRegistryFailure(error, {
      baseUrl,
      requestConstructionDetail: "Could not construct the Registry request.",
      ...context,
    });

  // ---------------------------------------------------------------------------
  // getExtensionIndex
  // ---------------------------------------------------------------------------
  const getExtensionIndex = (args: GetExtensionIndexArgs) =>
    executeRemoteRequest(
      client.ExtensionsGet(args.owner, pluralizeType(args.type), args.name, undefined).pipe(
        // Resolve the HTTP outcome first (404 → absent), then decode the index in
        // the effect so a schema-drift SchemaError is mapped through the error
        // channel (mapDiscoveryError's isSchemaError branch) instead of throwing
        // an uncatchable defect out of Effect.map.
        Effect.map((response) => Option.some(response)),
        Effect.catch((e) =>
          isRegistryClientError("ExtensionsGet404")(e)
            ? Effect.succeed(Option.none<ExtensionsGet200>())
            : Effect.fail(e),
        ),
      ),
      {
        operation: "get extension index",
        method: "GET",
        path: `/v1/extensions/${args.owner}/${pluralizeType(args.type)}/${args.name}`,
        replaySafety: safe,
        mapError: (error) => mapDiscoveryError(error, "REGISTRY_REMOTE_DISCOVERY"),
      },
    ).pipe(
      Effect.flatMap((response) => {
        if (Option.isNone(response)) {
          return Effect.succeed(Option.none<ExtensionIndex>());
        }
        const responseValue = response.value;
        if (responseValue === undefined) {
          return Effect.fail(
            new RegistryRequestFailed({
              category: "internal",
              detail: "Remote Registry returned an extension index without a body",
            }),
          );
        }
        return Effect.try({
          try: () => Option.some(mapToExtensionIndex(responseValue)),
          catch: (cause) => mapDiscoveryError(cause, "REGISTRY_REMOTE_DISCOVERY"),
        });
      }),
    );

  const getExactExtensionVersion = (
    args: GetExactExtensionVersionArgs,
  ): Effect.Effect<Option.Option<ExactExtensionVersion>, RegistryClientFailure> => {
    const exactClient = GeneratedRegistryClient.make(remoteHttpClient, {
      transformClient: (baseClient) =>
        Effect.succeed(
          args.accessToken === undefined
            ? baseClient
            : baseClient.pipe(
                HttpClient.mapRequest(HttpClientRequest.bearerToken(args.accessToken)),
              ),
        ),
    });
    return executeRemoteRequest(
      exactClient
        .ExtensionsGetVersion(
          args.owner,
          pluralizeType(args.type),
          args.name,
          args.version,
          undefined,
        )
        .pipe(
          Effect.map((response) =>
            Option.some({
              owner: decodeHandleSync(response.owner),
              type: narrowExtensionType(response.type),
              name: decodeExtensionNameSync(response.name),
              version: decodeVersionSync(response.version),
              integrity: response.integrity,
              status: response.status,
            } satisfies ExactExtensionVersion),
          ),
          Effect.catch((error) =>
            isRegistryClientError("ExtensionsGetVersion404")(error)
              ? Effect.succeed(Option.none<ExactExtensionVersion>())
              : Effect.fail(error),
          ),
        ),
      {
        operation: "get exact extension version",
        method: "GET",
        path: `/v1/extensions/${args.owner}/${pluralizeType(args.type)}/${args.name}/${args.version}`,
        replaySafety: safe,
        mapError: (error) => mapDiscoveryError(error, "REGISTRY_REMOTE_DISCOVERY"),
        policy: SETTLEMENT_READ_REQUEST_POLICY,
      },
    );
  };

  /**
   * Map all discovery/read errors to typed registry failures.
   */
  const mapDiscoveryError = (e: unknown, _prefix: string): RegistryClientFailure => {
    return mapFailure(e, {
      networkDetail: "Failed to connect to remote registry discovery endpoint",
      incompatibleDetail: "Remote discovery response does not match expected schema",
      fallbackDetail: "Remote discovery failed",
    });
  };

  // ---------------------------------------------------------------------------
  // getExtensionsByScope
  // ---------------------------------------------------------------------------
  const getExtensionsByScope = (
    args: GetExtensionsByOwnerArgs,
  ): Effect.Effect<GetExtensionsByOwnerResponse, RegistryClientFailure> =>
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

        const requests = args.names.flatMap((name) =>
          requestedTypes.map((type) => ({ name, type })),
        );
        const maybeEntries = yield* Effect.forEach(
          requests,
          ({ name, type }) =>
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
                  : getExtensionIndex({ owner, type, name: decodedName }),
              ),
            ),
          { concurrency: REGISTRY_READ_CONCURRENCY },
        );

        allExtensions = maybeEntries.flatMap((entry) =>
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
  ): Effect.Effect<ReadonlyArray<RegistryExtensionManifest>, RegistryClientFailure> =>
    Effect.gen(function* () {
      // Fetch extension lists by type
      const listResults =
        args.types.length === 0
          ? [yield* fetchExtensionList(args.owner)]
          : yield* Effect.forEach(
              args.types,
              (type) => fetchExtensionListByType(args.owner, type),
              { concurrency: REGISTRY_READ_CONCURRENCY },
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
        { concurrency: REGISTRY_READ_CONCURRENCY },
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
  ): Effect.Effect<ExtensionsListByOwner200["extensions"], RegistryClientFailure> =>
    executeRemoteRequest(client.ExtensionsListByOwner(owner, undefined), {
      operation: "list owner extensions",
      method: "GET",
      path: `/v1/extensions/${owner}`,
      replaySafety: safe,
      mapError: (error) => mapDiscoveryError(error, "REGISTRY_REMOTE_DISCOVERY"),
    }).pipe(Effect.map((response) => response.extensions));

  const fetchExtensionListByType = (
    owner: Handle | "*",
    type: ExtensionType,
  ): Effect.Effect<ExtensionsListByOwner200["extensions"], RegistryClientFailure> =>
    executeRemoteRequest(client.ExtensionsListByType(owner, pluralizeType(type), undefined), {
      operation: "list owner extensions by type",
      method: "GET",
      path: `/v1/extensions/${owner}/${pluralizeType(type)}`,
      replaySafety: safe,
      mapError: (error) => mapDiscoveryError(error, "REGISTRY_REMOTE_DISCOVERY"),
    }).pipe(Effect.map((response) => response.extensions));

  // ---------------------------------------------------------------------------
  // ownerExists
  // ---------------------------------------------------------------------------
  const ownerExists = (owner: Handle): Effect.Effect<OwnerExistsResponse, RegistryClientFailure> =>
    executeRemoteRequest(
      client.OwnersGetOwner(owner, undefined).pipe(
        Effect.as({ exists: true } satisfies OwnerExistsResponse),
        Effect.catch((e) => {
          // 404 → not found
          if (hasTagSuffix(e, "404")) {
            return Effect.succeed({ exists: false } satisfies OwnerExistsResponse);
          }
          return Effect.fail(e);
        }),
      ),
      {
        operation: "get owner",
        method: "GET",
        path: `/v1/owners/${owner}`,
        replaySafety: safe,
        mapError: mapOwnerExistsError,
      },
    );

  /**
   * Map ownerExists errors to typed registry failures.
   */
  const mapOwnerExistsError = (e: unknown): RegistryClientFailure => {
    return mapFailure(e, {
      networkDetail: "Failed to connect to remote registry owner endpoint",
      incompatibleDetail: "Remote owner endpoint response does not match expected schema",
      fallbackDetail: "Remote owner check failed",
    });
  };

  // ---------------------------------------------------------------------------
  // getExtensionPackage
  // ---------------------------------------------------------------------------
  const getExtensionPackage = (
    args: GetExtensionPackageArgs,
  ): Effect.Effect<GetExtensionPackageResponse, RegistryClientFailure> =>
    Effect.gen(function* () {
      // Step 1: Fetch extension index
      const indexResult = yield* executeRemoteRequest(
        client.ExtensionsGet(args.owner, pluralizeType(args.type), args.name, undefined),
        {
          operation: "get package index",
          method: "GET",
          path: `/v1/extensions/${args.owner}/${pluralizeType(args.type)}/${args.name}`,
          replaySafety: safe,
          mapError: mapPackageFetchError,
        },
      );

      if (indexResult === undefined) {
        return yield* new RegistryRequestFailed({
          category: "internal",
          detail: "Remote Registry returned a package index without a body",
        });
      }

      const index = yield* Effect.try({
        try: () => mapToExtensionIndex(indexResult),
        catch: (cause) => mapDiscoveryError(cause, "REGISTRY_REMOTE_DISCOVERY"),
      });

      // Step 2: Resolve version
      const resolvedEntry = resolveVersionEntry(index.versions, args.version);

      if (Option.isNone(resolvedEntry)) {
        return yield* new RegistryOperationFailed({
          category: "not_found",
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

      // Step 3: Download archive, streaming the body so the caller observes
      // progress as bytes arrive; the transport never decides how often.
      const archivePath = `/v1/extensions/${args.owner}/${pluralizeType(args.type)}/${args.name}/${resolvedEntry.value.version}/archive`;
      const archive = yield* executeRemoteRequest(
        downloadArchive(
          args.usagePurpose === "verification" ? verificationHttpClient : remoteHttpClient,
          archivePath,
          args.onProgress,
        ),
        {
          operation: "download package archive",
          method: "GET",
          path: archivePath,
          replaySafety: safe,
          mapError: mapArchiveFetchError,
        },
      );

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
  const mapPackageFetchError = (e: unknown): RegistryClientFailure => {
    const mapped = mapFailure(e, {
      networkDetail: "Failed to connect to remote registry package endpoint",
      incompatibleDetail: "Remote package index response does not match expected schema",
      fallbackDetail: "Remote package index request failed",
    });
    return mapped.metadata?.response?.status === 404
      ? withRegistrySemantics(mapped, {
          category: "not_found",
          detail: "Remote package index was not found",
        })
      : mapped;
  };

  /**
   * Map errors from the archive download step of getExtensionPackage.
   */
  const mapArchiveFetchError = (e: unknown): RegistryClientFailure => {
    const mapped = mapFailure(e, {
      networkDetail: "Failed to connect to remote registry package archive endpoint",
      incompatibleDetail: "Failed to read remote package archive response",
      fallbackDetail: "Remote package archive request failed",
    });
    return mapped.metadata?.response?.status === 404
      ? withRegistrySemantics(mapped, {
          category: "not_found",
          detail: "Remote package archive was not found",
        })
      : mapped;
  };

  // ---------------------------------------------------------------------------
  // extensionExists
  // ---------------------------------------------------------------------------
  const extensionExists = (
    args: ExtensionExistsArgs,
  ): Effect.Effect<ExtensionExistsResponse, RegistryClientFailure> =>
    executeRemoteRequest(
      client.ExtensionsHead(args.owner, pluralizeType(args.type), args.name, undefined).pipe(
        Effect.map(() => ({ exists: true }) satisfies ExtensionExistsResponse),
        Effect.catch((e) => {
          if (getTag(e) === "404") {
            return Effect.succeed({ exists: false } satisfies ExtensionExistsResponse);
          }
          return Effect.fail(e);
        }),
      ),
      {
        operation: "check extension",
        method: "HEAD",
        path: `/v1/extensions/${args.owner}/${pluralizeType(args.type)}/${args.name}`,
        replaySafety: safe,
        mapError: mapExtensionExistsError,
      },
    );

  /**
   * Map extensionExists errors to typed registry failures.
   */
  const mapExtensionExistsError = (e: unknown): RegistryClientFailure => {
    return mapFailure(e, {
      networkDetail: "Failed to connect to remote registry extension check endpoint",
      incompatibleDetail: "Remote extension check response does not match expected schema",
      fallbackDetail: "Remote extension check failed",
    });
  };

  // ---------------------------------------------------------------------------
  // publishExtension
  // ---------------------------------------------------------------------------
  const publishExtension = (
    args: PublishExtensionArgs,
  ): Effect.Effect<PublishExtensionResponse, RegistryClientFailure> => {
    if (
      args.condition === undefined ||
      args.publicationSetDigest === undefined ||
      args.publicationDescriptorDigest === undefined
    ) {
      return Effect.fail(
        new RegistryOperationFailed({
          category: "validation",
          detail: "Remote publish requires an admitted publication-set preview.",
          suggestions: [{ description: "Preview the complete publication set before uploading." }],
        }),
      );
    }
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

    return executeRemoteRequest(
      publishClient
        .ExtensionsPublishVersion(args.owner, pluralizeType(args.type), args.name, args.version, {
          params: {
            "if-match": args.condition,
            "x-axm-publication-set-digest": args.publicationSetDigest,
            "x-axm-publication-descriptor-digest": args.publicationDescriptorDigest,
            "x-axm-visibility-input": JSON.stringify(args.visibilityInput),
            ...(args.visibility === undefined ? {} : { visibility: args.visibility.value }),
          },
        })
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
                warnings: response.warnings.map((warning) => ({
                  ruleId: warning.ruleId,
                  severity: "warning" as const,
                  message: warning.message,
                  suggestions: warning.suggestions.map(normalizeRegistrySuggestedAction),
                })),
              }) satisfies PublishExtensionResponse,
          ),
        ),
      {
        operation: "publish extension version",
        method: "PUT",
        path: `/v1/extensions/${args.owner}/${pluralizeType(args.type)}/${args.name}/${args.version}`,
        replaySafety: mutation,
        mapError: mapPublishError,
        policy: PUBLISH_REGISTRY_REQUEST_POLICY,
      },
    );
  };

  const previewExtensionPublishes = (
    args: PreviewExtensionPublishesArgs,
  ): Effect.Effect<PublishPreviewResult, RegistryClientFailure> =>
    executeRemoteRequest(
      client
        .PublishPreviewsPreviewExtensionPublishes({
          payload: encodePublicationSetRequest(args),
          config: undefined,
        })
        .pipe(
          Effect.flatMap((response) =>
            Effect.try({
              try: () =>
                validatePublicationSetResponse(
                  validatePublicationDescriptors(args.candidates),
                  decodePublicationSetResponse(response),
                ),
              catch: (cause) =>
                new RegistryRequestFailed({
                  category: "internal",
                  detail: "The registry returned an incompatible publication-set preview.",
                  cause,
                }),
            }),
          ),
        ),
      {
        operation: "preview extension publishes",
        method: "POST",
        path: "/v1/publish-previews",
        replaySafety: safe,
        mapError: (error) =>
          mapFailure(error, {
            networkDetail: "Failed to connect to the publish preview endpoint",
            incompatibleDetail:
              "The registry returned an incompatible authoritative publish preview.",
            fallbackDetail: "Publish preview failed",
          }),
      },
    );

  const updateExtensionVisibility = (args: UpdateExtensionVisibilityArgs) => {
    const target = parseExtensionFqnParts(args.target);
    if (target === undefined) {
      return Effect.fail(
        new RegistryOperationFailed({
          category: "validation",
          detail: `Invalid extension target: ${args.target}`,
        }),
      );
    }
    const payload = {
      target: args.target,
      visibility: args.visibility,
      authority: args.authority,
      revision: args.revision,
      ...(args.verification === undefined ? {} : { verification: args.verification }),
    };
    return executeRemoteRequest(
      client.ExtensionsUpdateVisibility(target.owner, pluralizeType(target.type), target.name, {
        params: {
          "if-match": args.revision,
          ...(args.verification === undefined
            ? {}
            : { "x-axm-step-up-request": args.verification }),
        },
        payload,
        config: undefined,
      }),
      {
        operation: "update extension visibility",
        method: "PATCH",
        path: `/v1/extensions/${target.owner}/${pluralizeType(target.type)}/${target.name}`,
        replaySafety: mutation,
        mapError: (error) =>
          mapFailure(error, {
            networkDetail: "Failed to connect to extension visibility endpoint",
            incompatibleDetail: "Extension visibility response does not match the expected schema.",
            fallbackDetail: "Remote extension visibility update failed",
          }),
      },
    );
  };

  const getExtensionVisibility = (args: GetExtensionVisibilityArgs) =>
    executeRemoteRequest(
      client.ExtensionsGetVisibility(args.owner, pluralizeType(args.type), args.name, {
        ...(args.intent === null
          ? {}
          : {
              params: {
                intent_visibility: args.intent.value,
                intent_source: args.intent.source,
                intent_fingerprint: args.intent.fingerprint,
              },
            }),
        config: undefined,
      }),
      {
        operation: "get extension visibility",
        method: "GET",
        path: `/v1/extensions/${args.owner}/${pluralizeType(args.type)}/${args.name}/visibility`,
        replaySafety: safe,
        mapError: (error) =>
          mapFailure(error, {
            networkDetail: "Failed to connect to extension visibility endpoint",
            incompatibleDetail: "Extension visibility response does not match the expected schema.",
            fallbackDetail: "Remote extension visibility evaluation failed",
          }),
      },
    );

  /**
   * Map all publish error types through the shared Registry boundary.
   */
  const mapPublishError = (e: unknown): RegistryClientFailure =>
    mapFailure(e, {
      networkDetail: "Remote registry is unreachable",
      incompatibleDetail: "The registry returned a response the CLI could not parse.",
      fallbackDetail: "Publish failed",
    });

  // ---------------------------------------------------------------------------
  // discoverPackages
  // ---------------------------------------------------------------------------
  const discoverPackages = (
    args: DiscoverPackagesArgs,
  ): Effect.Effect<
    import("@agentxm/registry-protocol/unstable/registry/discover-schema").DiscoverPackagesResponse,
    RegistryClientFailure
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

    return executeRemoteRequest(
      client
        .DiscoveryPostDiscovery({ payload, config: undefined })
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(DiscoverPackagesResponseSchema))),
      {
        operation: "discover packages",
        method: "POST",
        path: "/v1/discovery",
        replaySafety: safe,
        mapError: (error) => mapDiscoveryError(error, "REGISTRY_REMOTE_DISCOVERY"),
      },
    );
  };

  return {
    getExtensionIndex,
    getExactExtensionVersion,
    getExtensionsByScope,
    ownerExists,
    getExtensionPackage,
    publishExtension,
    previewExtensionPublishes,
    getExtensionVisibility,
    updateExtensionVisibility,
    extensionExists,
    discoverPackages,
  };
};
