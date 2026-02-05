/**
 * Skills management module for @agentxm/core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export type { Source as LockSourceType } from "../sources.js";
// Git
export {
  cloneRepo,
  GitError,
  getCurrentCommit,
  getTreeSha,
  isGitRepository,
  resolveRef,
} from "./git.js";
// Skill Discovery
export { DiscoveryError, discoverSkills } from "./skill-discovery.js";
// Source Parser
export {
  buildCloneUrl,
  CloneUrlError,
  getOriginFromParsed,
  ParseError,
  parseSource,
} from "./source-parser.js";
// Types
export type {
  LockEntry,
  ParsedSource,
  Skill,
  Source,
  WellKnownIndex,
  WellKnownSkill,
} from "./types.js";

// Well-Known Discovery
export type { WellKnownError } from "./wellknown.js";
export {
  discoverWellKnownSkills,
  fetchSkillFiles,
  fetchWellKnownIndex,
  isWellKnownEligible,
  WellKnownFetchError,
  WellKnownInvalidIndexError,
  WellKnownNotFoundError,
} from "./wellknown.js";
