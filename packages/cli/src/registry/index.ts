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
export type { ExtensionIndex, RegistryExtensionType, VersionEntry } from "./schema.js";
export { ExtensionIndexSchema, RegistryExtensionTypeSchema, VersionEntrySchema } from "./schema.js";

// Client types and implementation
export type { RegistryClient, RegistryExtensionEntry, RegistrySearchOptions } from "./client.js";
export {
  createLocalRegistryClient,
  createRegistryClient,
  createRemoteRegistryClient,
} from "./client.js";

// Utilities
export type { VersionSelectOptions } from "./utils.js";
export { extensionDir, extractZip, pluralizeType, selectVersion } from "./utils.js";
