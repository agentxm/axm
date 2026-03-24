/**
 * Settings feature module.
 *
 * Provides settings schema definitions and I/O functions for managing
 * the `.axm/settings.json` configuration file.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Schema types and schemas
export type {
  AzureReposSourceHostConfig,
  BitbucketSourceHostConfig,
  NonSkillExtensionsMap,
  GitHubSourceHostConfig,
  GitLabSourceHostConfig,
  IgnoredSettings,
  PackEntry,
  PacksMap,
  RegistrySourceHostConfig,
  Settings,
  SkillEntry,
  SkillsMap,
  SourceHostConfig,
} from "./schema.js";
export {
  IgnoredSettingsSchema,
  NonSkillExtensionsMapSchema,
  PackEntryObjectSchema,
  PackEntrySchema,
  PacksMapSchema,
  SETTINGS_KEY_ORDER,
  SettingsSchema,
  SkillEntryObjectSchema,
  SkillEntrySchema,
  SkillsMapSchema,
  SourceHostConfigSchema,
} from "./schema.js";

// Skill entry normalization
export type { NormalizedSkillEntry } from "./skill-entry.js";
export { collapseSkillEntry, getSkillEntrySource, normalizeSkillEntry } from "./skill-entry.js";

// Ignored patterns
export { normalizeIgnoredPatterns, validateIgnoredConfigConflicts } from "./ignored-patterns.js";

// Settings I/O
export {
  createDefaultSettings,
  DEFAULT_PROFILE,
  orderSettingsKeys,
  readSettings,
  SETTINGS_FILENAME,
  writeSettings,
} from "./settings.js";

// Format-preserving JSON
export type { JsonModification } from "./format-preserving-json.js";
