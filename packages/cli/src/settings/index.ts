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
export type { SettingsError, SettingsErrorTag } from "./settings.js";
export {
  createDefaultSettings,
  DEFAULT_SCOPE,
  SETTINGS_FILENAME,
  SettingsNotFoundError,
  SettingsParseError,
  SettingsWriteError,
} from "./settings.js";

// Settings service
export type { SettingsServiceInterface } from "./service.js";
export { SettingsService, SettingsServiceLive } from "./service.js";
