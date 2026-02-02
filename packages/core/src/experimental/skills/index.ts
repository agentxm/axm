/**
 * Skills management module for @agentxm/core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Agent Detection
export {
  DetectionError,
  detectAgents,
  getAgentById,
  getSupportedAgentIds,
  SUPPORTED_AGENTS,
} from "./agent-detection.js";
// Content Hash
export { computeContentHash, HashError } from "./content-hash.js";
// Git
export { cloneRepo, GitError, getCurrentCommit, resolveRef } from "./git.js";
// Installer
export type { InstallMethod, InstallResult } from "./installer.js";
export {
  copySkillToCanonical,
  copyToAgent,
  createAgentSymlink,
  InstallError,
  installSkill,
  installSkillToAgents,
} from "./installer.js";
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
export type { EnsureInitializedOptions, SettingsError } from "./settings.js";
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
export { ParseError, parseSource } from "./source-parser.js";
// Types
export type {
  AgentConfig,
  LockEntry,
  Lockfile,
  ParsedSource,
  Settings,
  Skill,
  SkillSettings,
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
