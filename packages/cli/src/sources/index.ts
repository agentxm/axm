/**
 * Source parsing and identification module.
 *
 * Provides functionality to parse various source formats (GitHub shorthand, URLs, etc.)
 * into normalized ParsedSource structures.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Types
export type { BaseSource, ParsedSource, Source } from "./types.js";
export { SourceSchema } from "./types.js";

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

// Well-known discovery
export type { WellKnownError } from "./wellknown/index.js";
export {
  discoverWellKnownSkills,
  fetchSkillFiles,
  fetchWellKnownIndex,
  isWellKnownEligible,
  WellKnownFetchError,
  WellKnownInvalidIndexError,
  WellKnownNotFoundError,
} from "./wellknown/index.js";

// Well-known types
export type { WellKnownIndex, WellKnownSkill } from "./wellknown/index.js";
