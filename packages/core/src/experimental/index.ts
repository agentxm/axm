/**
 * Experimental APIs for @agentxm/core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export * from "./skills/git.js";
export type {
  EnsureInitializedOptions,
  SettingsError,
  SettingsErrorTag,
} from "./skills/settings.js";

// Settings module
export {
  addSkill,
  createDefaultSettings,
  ensureInitialized,
  readSettings,
  SettingsNotFoundError,
  SettingsParseError,
  SettingsWriteError,
  updateSettings,
  writeSettings,
} from "./skills/settings.js";
// Skills types
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
} from "./skills/types.js";
