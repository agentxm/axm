/**
 * @agentxm/registry-client public API.
 *
 * The registry integration: local and remote registry clients over the
 * generated OpenAPI transport, request policy and retry, the typed registry
 * failure vocabulary with problem-details translation, the content-addressed
 * archive cache, lifecycle administration, and package metadata schemas.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Client types and factory
export type {
  RegistryClient,
  RegistryExtensionManifest,
  DiscoverPackageInput,
  DiscoverPackagesArgs,
  GetExtensionsByOwnerArgs,
  GetExtensionsByOwnerResponse,
  GetExtensionIndexArgs,
  GetExactExtensionVersionArgs,
  ExactExtensionVersion,
  GetExtensionVisibilityArgs,
  GetExtensionPackageArgs,
  GetExtensionPackageResponse,
  PublishExtensionArgs,
  PublishExtensionResponse,
  RegistryPublishWarning,
  PreviewExtensionPublishesArgs,
  PublishPreviewResult,
  PublishPreviewTarget,
  OwnerExistsResponse,
  ExtensionExistsArgs,
  ExtensionExistsResponse,
  ExtensionVisibility,
  UpdateExtensionVisibilityArgs,
} from "./client.js";
export { createRegistryClient } from "./client.js";

// Local client
export { createLocalRegistryClient } from "./local-client.js";

// Remote client
export { createRemoteRegistryClient } from "./remote-client.js";
export {
  DEFAULT_REGISTRY_REQUEST_POLICY,
  PUBLISH_REGISTRY_REQUEST_POLICY,
  executeRegistryRequest,
  type RegistryRequestPolicy,
  type RegistryRequestReplaySafety,
} from "./request-policy.js";

export type {
  ArchiveCache,
  ArchiveCacheOptions,
  ArchiveCachePruneResult,
  ArchiveCacheStatus,
  ArchiveCacheVerifyResult,
} from "./archive-cache.js";
export {
  resolveAxmCacheRoot,
  resolveAxmCacheRootPure,
  type AxmCacheEnvironment,
} from "./cache-root.js";
export {
  ARCHIVE_CACHE_MAX_AGE,
  ARCHIVE_CACHE_MAX_BYTES,
  makeArchiveCache,
  makeUserArchiveCache,
} from "./archive-cache.js";

export type {
  RegistryExtensionReference,
  RegistryExtensionVersionReference,
  RegistryLifecycleCallOptions,
  PutExtensionDeprecationInput,
  YankCategory,
} from "./admin-client.js";
export {
  yankExtensionVersion,
  yankAvailableExtensionVersions,
  unyankExtensionVersion,
  deprecateExtension,
  getExtensionDeprecation,
  undeprecateExtension,
} from "./admin-client.js";

// Failure vocabulary
export {
  REGISTRY_ERROR_CATEGORIES,
  RegistryOperationFailed,
  RegistryProblem,
  RegistryRequestFailed,
  isRegistryClientFailure,
  withRegistrySemantics,
  type RegistryClientFailure,
  type RegistryErrorCategory,
  type RegistryErrorMetadata,
  type RegistryRequestMetadata,
  type RegistryRequestPolicyMetadata,
  type RegistryResponseMetadata,
} from "./errors.js";

// Failure translation
export {
  httpStatusToCategory,
  registryClientErrorToProblem,
  registryErrorToProblem,
  type ProblemDetails,
} from "./translate.js";
export {
  captureRegistryErrorResponseBodies,
  mapRegistryFailure,
  type RegistryFailureContext,
} from "./failure-mapping.js";

// Error mapping helpers
export {
  buildNetworkSuggestions,
  buildNetworkDiagnosis,
  getString,
  isRegistryClientError,
  isHttpClientError,
  isSchemaError,
  isTransientHttpClientError,
  mapNetworkError,
  mapSchemaError,
  mapUnexpectedStatusError,
} from "./error-mapping.js";

// Utilities
export {
  extensionDir,
  extensionLifecycleWarnings,
  extractZip,
  pluralizeType,
  resolveVersionEntry,
  resolveVersionEntryForReleaseAge,
  resolveVersionEntryWithReleaseAge,
  selectVersion,
} from "./utils.js";
export { formatDeprecationWarning } from "./deprecation-warning.js";
export type { ReleaseAgeVersionResolution } from "./utils.js";

export { RegistryUrl } from "./registry-url.js";

// Package metadata schemas
export {
  AxmPackageMetaSchema,
  PackageExtensionDeclarationSchema,
  type AxmPackageMeta,
  type PackageExtensionDeclaration,
} from "./axm-package-meta.js";
export { purlIdentityMatch, purlMatch } from "./purl-match.js";

// Generated OpenAPI transport (consumed by the registry-auth feature)
export * as GeneratedRegistryClient from "./__generated__/registry-client.js";
