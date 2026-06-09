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
export type { ExtensionIndex, VersionEntry } from "./schema.js";
export { packagesToPackageUrlParts, ExtensionIndexSchema, VersionEntrySchema } from "./schema.js";

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
  GetExtensionPackageArgs,
  GetExtensionPackageResponse,
  GetLibraryArgs,
  PublishExtensionArgs,
  PublishExtensionResponse,
  OwnerExistsResponse,
  ExtensionExistsArgs,
  ExtensionExistsResponse,
  RegistryLibrary,
  RegistryLibraryDetail,
  RegistryLibraryMaintainer,
  RegistryLibraryMember,
  RegistryLibraryVisibility,
} from "./client.js";
export { createRegistryClient } from "./client.js";

// Local client
export { createLocalRegistryClient } from "./local-client.js";

// Remote client
export { createRemoteRegistryClient } from "./remote-client.js";

export type {
  ExtensionGrantEntry,
  ExtensionGrantRole,
  ExtensionGrantsResponse,
  ExtensionMaintainer,
  ExtensionMaintainerTarget,
  RegistryExtensionReference,
} from "./admin-client.js";
export {
  clearExtensionMaintainer,
  deleteTeamExtensionGrant,
  deleteUserExtensionGrant,
  getExtensionMaintainer,
  listExtensionGrants,
  setExtensionMaintainer,
  upsertTeamExtensionGrant,
  upsertUserExtensionGrant,
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
  extractZip,
  pluralizeType,
  resolveVersionEntry,
  resolveVersionEntryWithReleaseAge,
  selectVersion,
} from "./utils.js";

export {
  DEFAULT_MINIMUM_RELEASE_AGE,
  DEFAULT_MINIMUM_RELEASE_AGE_MS,
  filterMatureVersions,
  isVersionEntryMature,
  parseMinimumReleaseAge,
  releaseAgeHoldbackWarning,
} from "./release-age-policy.js";
export type { ReleaseAgePolicy } from "./release-age-policy.js";
