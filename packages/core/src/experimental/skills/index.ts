/**
 * Skills management module for @agentxm/core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export type { SourceType as LockSourceType } from "../schemas/extension-sources.js";
export type { Lockfile, SkillLockEntry } from "../schemas/lockfile.js";
export type { Settings } from "../schemas/settings.js";
// Git
export {
  cloneRepo,
  GitError,
  getCurrentCommit,
  getTreeSha,
  isGitRepository,
  resolveRef,
} from "./git.js";
// Lockfile
export type { LockfileError } from "./lockfile.js";
export {
  LockfileParseError,
  LockfileWriteError,
  readLockfile,
  removeLockEntry,
  updateLockEntry,
  writeLockfile,
} from "./lockfile.js";
// Settings
export type {
  EnsureInitializedOptions,
  SettingsError,
  SettingsUpdate,
  SkillsUpdate,
} from "./settings.js";
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
} from "./settings.js";
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
