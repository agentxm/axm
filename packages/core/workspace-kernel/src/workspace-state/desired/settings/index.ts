/**
 * Settings feature module.
 *
 * Provides settings schema definitions and I/O functions for managing
 * project-root or user-workspace `axm.json` configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Schema types and schemas
export type {
  HookEntry,
  KnowledgeMap,
  InstructionsConfig,
  InstructionsConfigValue,
  McpServerEntry,
  MinimumReleaseAge,
  RuleEntry,
  Settings,
  SkillEntry,
  SubagentEntry,
  SourceHostConfig,
} from "./schema.js";
export { DEFAULT_MINIMUM_RELEASE_AGE, SETTINGS_KEY_ORDER, SettingsSchema } from "./schema.js";

// Settings I/O
export { createDefaultSettings, writeSettingsAtPath } from "./settings.js";
export { SettingsWriteError } from "./errors.js";

// Format-preserving JSON
