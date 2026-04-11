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
  CommandEntry,
  CommandsMap,
  GitHubSourceHostConfig,
  GitLabSourceHostConfig,
  IgnoredSettings,
  McpServerEntry,
  McpServersMap,
  ExtensionPackEntry,
  ExtensionPacksMap,
  RegistrySourceHostConfig,
  Settings,
  SkillEntry,
  SkillsMap,
  SubagentEntry,
  SubagentsMap,
  SourceHostConfig,
} from "./schema.js";
export {
  CommandEntryObjectSchema,
  CommandEntrySchema,
  CommandsMapSchema,
  IgnoredSettingsSchema,
  McpServerEntryObjectSchema,
  McpServerEntrySchema,
  McpServersMapSchema,
  ExtensionPackEntryObjectSchema,
  ExtensionPackEntrySchema,
  ExtensionPacksMapSchema,
  SETTINGS_KEY_ORDER,
  SettingsSchema,
  SkillEntryObjectSchema,
  SkillEntrySchema,
  SkillsMapSchema,
  SubagentEntryObjectSchema,
  SubagentEntrySchema,
  SubagentsMapSchema,
  SourceHostConfigSchema,
} from "./schema.js";

// Skill entry normalization
export type { NormalizedSkillEntry } from "./skill-entry.js";
export { collapseSkillEntry, getSkillEntrySource, normalizeSkillEntry } from "./skill-entry.js";

// Command entry normalization
export type { NormalizedCommandEntry } from "./command-entry.js";
export {
  collapseCommandEntry,
  getCommandEntrySource,
  normalizeCommandEntry,
} from "./command-entry.js";

// Subagent entry normalization
export type { NormalizedSubagentEntry } from "./subagent-entry.js";
export {
  collapseSubagentEntry,
  getSubagentEntrySource,
  normalizeSubagentEntry,
} from "./subagent-entry.js";

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
