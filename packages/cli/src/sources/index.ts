/**
 * Source parsing and identification module.
 *
 * Provides functionality to parse various source formats (GitHub shorthand, URLs, etc.)
 * into normalized ParsedSource structures.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Types (these are interface types distinct from the ParsedSource namespace)
export type {
  AzureDevOpsSource,
  BitbucketSource,
  GenericGitSource,
  GitHubSource,
  GitLabSource,
  GitSource,
  LocalSource,
  RegistrySource,
  SourceType,
} from "./types.js";
// ParsedSource is both a type and value - export it properly
export { ParsedSource, SourceTypeSchema } from "./types.js";
// Re-export the ParsedSource type alias separately for type-only imports
export type { ParsedSource as ParsedSourceUnion } from "./types.js";

// Type guards
export { isGitSource } from "./utils.js";

// Errors
export { CloneUrlError, ParseError } from "./errors.js";

// Main parser
export { parseSource } from "./parser.js";

// Clone URL utilities
export { buildCloneUrl, getOriginFromParsed } from "./clone-url.js";

// Git operations
export type { GitError } from "./git/index.js";
export {
  cloneRepo,
  getCurrentCommit,
  getTreeSha,
  isGitRepository,
  resolveRef,
} from "./git/index.js";

// GitHub API
export type { GitHubApiError } from "./github/index.js";
export { fetchGitHubTreeHash } from "./github/index.js";
