/**
 * Registry feature module.
 *
 * Provides schema definitions for registry layout including extension index
 * metadata and version entries, client types, and shared utilities.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Schema types and schemas
export type {
  DeprecationReplacement,
  DeprecationReplacementIntent,
  DeprecationManagementView,
  DeprecationTransition,
  DeprecationView,
  ExtensionIndex,
  VersionEntry,
} from "./schema.js";
export {
  DeprecationReplacementSchema,
  DeprecationReplacementIntentSchema,
  DeprecationManagementViewSchema,
  DeprecationTransitionSchema,
  DeprecationRevisionSchema,
  DeprecationViewSchema,
  packagesToPackageUrlParts,
  ExtensionIndexSchema,
  VersionEntrySchema,
} from "./schema.js";

// Discover schemas
export type {
  DiscoverPackagesResponse,
  DiscoveryExtensionResult,
  DiscoveryPackageResult,
  DiscoveryResolvedExtension,
} from "./discover-schema.js";
export {
  DiscoverPackagesResponseSchema,
  DiscoveryExtensionResultSchema,
  DiscoveryPackageResultSchema,
  DiscoveryResolvedExtensionSchema,
} from "./discover-schema.js";

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
export {
  MAX_PUBLICATION_SET_CANDIDATES,
  PUBLICATION_SET_CONTRACT,
  PackDependencyFindingSchema,
  PreviewPublicationSetRequestSchema,
  PreviewPublicationSetResponseSchema,
  PublicationVisibilityInputSchema,
  Sha256HexSchema,
  archiveSha256Hex,
  comparePublicationTargets,
  evaluateProspectivePackDependencies,
  evaluateProspectivePackDependencyState,
  normalizePublicationDescriptor,
  normalizePublicationSet,
  publicationDescriptorDigest,
  publicationSetDigest,
  publicationTargetKey,
  validatePublicationDescriptors,
  validatePublicationSetResponse,
} from "./publication-set.js";
export type {
  PackDependencyDescriptor,
  PackDependencyFinding,
  ProspectivePublicationCandidate,
  ProspectivePackDependencyState,
  PublicationDependencySnapshot,
  PublicationDependencyVersionSnapshot,
  PreviewPublicationSetRequest,
  PreviewPublicationSetResponse,
  PublicationCandidateResult,
  PublicationDescriptor,
  PublicationPackResult,
  PublicationTarget,
  PublicationVisibilityInput,
  Sha256Hex,
} from "./publication-set.js";

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

// Error mapping helpers
export {
  buildNetworkSuggestions,
  buildNetworkDiagnosis,
  isRegistryClientError,
  isHttpClientError,
  isSchemaError,
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

export {
  DEFAULT_MINIMUM_RELEASE_AGE,
  DEFAULT_MINIMUM_RELEASE_AGE_DURATION,
  filterMatureVersions,
  formatMinimumReleaseAgeSeconds,
  isVersionEntryEligibleAt,
  isVersionEntryMature,
  parseMinimumReleaseAge,
  releaseAgeEvidence,
  releaseAgeExemptionForIdentity,
  normalizeReleaseAgeRecords,
  releaseAgeHoldbackWarning,
} from "./release-age-policy.js";
export type {
  ReleaseAgeEvaluation,
  ReleaseAgeExemption,
  ReleaseAgeBypassRecord,
  ReleaseAgeEvidence,
  ReleaseAgeHoldbackRecord,
  ReleaseAgeOperationEvidence,
  ReleaseAgeRecord,
  ReleaseAgeRecordBase,
  ScopedReleaseAgeExcludePattern,
} from "./release-age-policy.js";
