/**
 * Extension resolution module.
 *
 * Resolves input strings to extension references with metadata.
 * This module is reusable across all extension types and commands.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Re-export errors
export { ResolutionError, type ResolutionErrorCode } from "./errors.js";
// Re-export types
export type {
  ExtensionMetadata,
  ExtensionRef,
  ExtensionType,
  ResolutionOptions,
  SourceType,
} from "./types.js";

// Note: resolveExtension will be exported here once resolver.ts is implemented
