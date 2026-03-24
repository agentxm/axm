/**
 * Settings feature module.
 *
 * Provides settings schema definitions and I/O functions for managing
 * the `.axm/settings.json` configuration file.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Re-export everything from core
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
} from "@axm.sh/core/unstable/settings";
export {
  collapseSkillEntry,
  createDefaultSettings,
  DEFAULT_NAMESPACE,
  getSkillEntrySource,
  IgnoredSettingsSchema,
  NonSkillExtensionsMapSchema,
  normalizeIgnoredPatterns,
  normalizeSkillEntry,
  orderSettingsKeys,
  PackEntryObjectSchema,
  PackEntrySchema,
  PacksMapSchema,
  readSettings,
  SETTINGS_FILENAME,
  SETTINGS_KEY_ORDER,
  SettingsSchema,
  SkillEntryObjectSchema,
  SkillEntrySchema,
  SkillsMapSchema,
  SourceHostConfigSchema,
  validateIgnoredConfigConflicts,
  writeSettings,
} from "@axm.sh/core/unstable/settings";
export type { NormalizedSkillEntry } from "@axm.sh/core/unstable/settings";
export type { JsonModification } from "@axm.sh/core/unstable/settings";
