/**
 * Experimental APIs for @agentxm/core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export type {
  ExtensionMetadata,
  ExtensionRef,
  ExtensionType,
  ResolutionOptions,
  SourceType as ResolutionSourceType,
} from "./resolution/index.js";
// Resolution module
export { ResolutionError, type ResolutionErrorCode, resolveExtension } from "./resolution/index.js";
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
  SourceType,
  WellKnownIndex,
  WellKnownSkill,
} from "./skills/types.js";
