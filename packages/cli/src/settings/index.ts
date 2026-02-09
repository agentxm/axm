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
export type { ExtensionMap, Settings, SkillsMap, SourceConfig } from "./schema.js";
export {
  ExtensionMapSchema,
  SettingsSchema,
  SkillsMapSchema,
  SourceConfigSchema,
} from "./schema.js";

// Settings I/O
export type { SettingsError } from "./settings.js";
export {
  createDefaultSettings,
  DEFAULT_SCOPE,
  readSettings,
  SETTINGS_FILENAME,
  SettingsNotFoundError,
  SettingsParseError,
  SettingsWriteError,
  writeSettings,
} from "./settings.js";

// Format-preserving JSON
export type { DetectedFormatting, JsonModification } from "./format-preserving-json.js";
export {
  detectFormatting,
  ensureTopLevelProperty,
  modifyJsonFile,
} from "./format-preserving-json.js";

// Settings service
export type { SettingsServiceInterface } from "./service.js";
export { SettingsService, SettingsServiceLive } from "./service.js";
