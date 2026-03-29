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
export { ExtensionIndexSchema, VersionEntrySchema } from "./schema.js";

// Client types and factory
export type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionsByProfileArgs,
  GetExtensionsByProfileResponse,
  GetExtensionIndexArgs,
  GetExtensionPackageArgs,
  GetExtensionPackageResponse,
  PublishExtensionArgs,
  PublishExtensionResponse,
  ProfileExistsResponse,
  ExtensionExistsArgs,
  ExtensionExistsResponse,
} from "./client.js";
export { createRegistryClient } from "./client.js";

// Local client
export { createLocalRegistryClient } from "./local-client.js";

// Remote client
export { createRemoteRegistryClient } from "./remote-client.js";

// Error mapping helpers
export {
  buildNetworkHowToFix,
  buildNetworkDiagnosis,
  isRegistryClientError,
  isHttpClientError,
  isSchemaError,
  mapAuthUnauthenticated,
  mapAuthUnauthorized,
  mapNetworkError,
  mapSchemaError,
  mapUnexpectedStatusError,
  getErrorCode,
  buildErrorDetails,
  getRetryAfterSeconds,
} from "./error-mapping.js";

// Utilities
export {
  extensionDir,
  extractZip,
  pluralizeType,
  resolveVersionEntry,
  selectVersion,
} from "./utils.js";
