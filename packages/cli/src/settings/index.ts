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
  EmptySource,
  ExtensionMap,
  PathSource,
  RegistrySource,
  Settings,
  SkillsMap,
  SourcesConfig,
  UrlSource,
} from "./schema.js";
export {
  EmptySourceSchema,
  ExtensionMapSchema,
  PathSourceSchema,
  RegistrySourceSchema,
  SettingsSchema,
  SkillsMapSchema,
  SourcesConfigSchema,
  UrlSourceSchema,
} from "./schema.js";

// Settings I/O
export type {
  /** @deprecated Use WorkspaceContext from workspace/service.ts instead */
  EnsureInitializedLegacyOptions,
  SettingsError,
  SettingsErrorTag,
  SettingsUpdate,
  SkillsUpdate,
} from "./settings.js";
export {
  addSkill,
  createDefaultSettings,
  DEFAULT_SCOPE,
  /** @deprecated Use WorkspaceContext from workspace/service.ts instead */
  ensureInitializedLegacy,
  getEffectiveScope,
  readSettings,
  SETTINGS_FILENAME,
  SettingsNotFoundError,
  SettingsParseError,
  SettingsWriteError,
  updateSettings,
  writeSettings,
} from "./settings.js";
