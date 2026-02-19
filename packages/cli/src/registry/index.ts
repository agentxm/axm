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
export type { ExtensionIndex, VersionEntry } from "./local-schema.js";
export { ExtensionIndexSchema, VersionEntrySchema } from "./local-schema.js";

// Client types and factory
export type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionsByNamespaceArgs,
  GetExtensionsByNamespaceResponse,
  GetExtensionPackageArgs,
  GetExtensionPackageResponse,
  PublishExtensionArgs,
  PublishExtensionResponse,
  NamespaceExistsResponse,
  ExtensionExistsArgs,
  ExtensionExistsResponse,
} from "./client.js";
export { createRegistryClient } from "./client.js";

// Local client
export { createLocalRegistryClient } from "./local-client.js";

// Remote client
export { createRemoteRegistryClient } from "./client-remote.js";

// Utilities
export { extensionDir, extractZip, pluralizeType, selectVersion } from "./utils.js";
