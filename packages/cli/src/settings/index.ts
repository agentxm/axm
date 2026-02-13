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
  SETTINGS_KEY_ORDER,
  SettingsSchema,
  SkillsMapSchema,
  SourceConfigSchema,
} from "./schema.js";

// Settings I/O
export {
  createDefaultSettings,
  DEFAULT_SCOPE,
  orderSettingsKeys,
  readSettings,
  SETTINGS_FILENAME,
  writeSettings,
} from "./settings.js";

// Format-preserving JSON
export type { DetectedFormatting, JsonModification } from "./format-preserving-json.js";
export {
  detectFormatting,
  ensureTopLevelProperty,
  modifyJsonFile,
} from "./format-preserving-json.js";
