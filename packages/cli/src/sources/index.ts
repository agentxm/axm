/**
 * Source parsing and identification module.
 *
 * Provides functionality to parse various source formats (GitHub shorthand, URLs, etc.)
 * into normalized Source structures.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Types
export type {
  AzureReposSource,
  BitbucketSource,
  GitHubSource,
  GitHostingProviderSource,
  GitLabSource,
  GitRepositorySource,
  GitSource,
  LocalSource,
  RegistrySource,
  Source,
  SourceType,
} from "./types.js";
export { SourceTypeSchema } from "./types.js";

// Type guards
export { isGitHostingProviderSource } from "./utils.js";

// Errors
export { CloneUrlError, ParseError } from "./errors.js";

// Main parser
export { parseSource } from "./parser.js";

// Printer
export { printSource } from "./printer.js";

// Clone URL utilities
export { buildCloneUrl, getOrigin } from "./clone-url.js";

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
