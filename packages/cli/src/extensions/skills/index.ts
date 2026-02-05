/**
 * Skills management module for @agentxm/core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export type { SourceType as LockSourceType } from "../sources.js";
export type { Lockfile, SkillLockEntry } from "../../workspace/lockfile-schema.js";
export type { Settings } from "../../workspace/settings-schema.js";
// Git
export {
  cloneRepo,
  GitError,
  getCurrentCommit,
  getTreeSha,
  isGitRepository,
  resolveRef,
} from "./git.js";
// Lockfile (re-exported from workspace)
export type { LockfileError } from "../../workspace/lockfile.js";
export {
  LockfileParseError,
  LockfileWriteError,
  readLockfile,
  removeLockEntry,
  updateLockEntry,
  writeLockfile,
} from "../../workspace/lockfile.js";
// Settings (re-exported from workspace)
export type {
  EnsureInitializedOptions,
  SettingsError,
  SettingsUpdate,
  SkillsUpdate,
} from "../../workspace/settings.js";
export {
  addSkill,
  createDefaultSettings,
  DEFAULT_SCOPE,
  ensureInitialized,
  getEffectiveScope,
  readSettings,
  SettingsNotFoundError,
  SettingsParseError,
  SettingsWriteError,
  updateSettings,
  writeSettings,
} from "../../workspace/settings.js";
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
  SourceType,
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
