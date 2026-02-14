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
  ExtensionMap,
  PackEntry,
  PacksMap,
  Settings,
  SkillEntry,
  SkillsMap,
  SourceConfig,
} from "./schema.js";
export {
  ExtensionMapSchema,
  PackEntryObjectSchema,
  PackEntrySchema,
  PacksMapSchema,
  SETTINGS_KEY_ORDER,
  SettingsSchema,
  SkillEntryObjectSchema,
  SkillEntrySchema,
  SkillsMapSchema,
  SourceConfigSchema,
  UnmanagedSkillEntrySchema,
} from "./schema.js";

// Skill entry normalization
export type { NormalizedSkillEntry } from "./skill-entry.js";
export { collapseSkillEntry, getSkillEntrySource, normalizeSkillEntry } from "./skill-entry.js";

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
