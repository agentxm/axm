/**
 * Skills management module for @axm.sh/core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export type { SourceType as LockSourceType } from "../../sources/index.js";

// Git - re-exported from sources/
export {
  cloneRepo,
  getCurrentCommit,
  getTreeSha,
  isGitRepository,
  resolveRef,
  shallowClone,
} from "../../sources/index.js";
export type { GitError } from "../../sources/index.js";

// Source Parser - re-exported from sources/
export {
  buildCloneUrl,
  CloneUrlError,
  getOrigin,
  isGitHostingProviderSource,
  ParseError,
  parseSource,
  printSource,
} from "../../sources/index.js";

// Types
export type { DiscoveredSkill, LockEntry, Skill } from "./types.js";

// Re-export source types from canonical location
export type {
  AzureReposSource,
  GitHostingProviderSource,
  Source,
  SourceType,
} from "../../sources/index.js";
