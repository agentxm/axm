/**
 * Skills management module for @agentxm/core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export type { BaseSource as LockSourceType } from "../../sources/index.js";

// Git - re-exported from sources/
export {
  cloneRepo,
  getCurrentCommit,
  getTreeSha,
  isGitRepository,
  resolveRef,
} from "../../sources/index.js";
export type { GitError } from "../../sources/index.js";

// Skill Discovery
export { DiscoveryError, discoverSkills } from "./skill-discovery.js";

// Source Parser - re-exported from sources/
export {
  buildCloneUrl,
  CloneUrlError,
  getOriginFromParsed,
  ParseError,
  parseSource,
} from "../../sources/index.js";

// Types
export type { LockEntry, Skill } from "./types.js";

// Re-export source types from canonical location
export type { ParsedSource, Source, WellKnownIndex, WellKnownSkill } from "../../sources/index.js";

// Well-Known Discovery - re-exported from sources/
export type { WellKnownError } from "../../sources/index.js";
export {
  discoverWellKnownSkills,
  fetchSkillFiles,
  fetchWellKnownIndex,
  isWellKnownEligible,
  WellKnownFetchError,
  WellKnownInvalidIndexError,
  WellKnownNotFoundError,
} from "../../sources/index.js";
