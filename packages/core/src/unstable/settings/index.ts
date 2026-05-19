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
  AgentsConfig,
  AzureReposSourceHostConfig,
  BitbucketSourceHostConfig,
  CommandsConfig,
  CommandEntry,
  CommandsMap,
  FileEntry,
  FileInputValuesMap,
  FilesMap,
  GitHubSourceHostConfig,
  GitLabSourceHostConfig,
  InstructionsConfig,
  InstructionsConfigValue,
  McpServersConfig,
  McpServerEntry,
  McpServersMap,
  PacksConfig,
  PackEntry,
  PacksMap,
  RegistrySourceHostConfig,
  Settings,
  SkillsConfig,
  SkillEntry,
  SkillsMap,
  SubagentsConfig,
  SubagentEntry,
  SubagentsMap,
  SourceHostConfig,
  WorkspaceVarsMap,
} from "./schema.js";
export {
  AgentsConfigSchema,
  CommandEntryObjectSchema,
  CommandEntrySchema,
  CommandsConfigSchema,
  CommandsMapSchema,
  FileEntryObjectSchema,
  FileEntrySchema,
  FileInputValuesMapSchema,
  FilesMapSchema,
  InstructionsConfigSchema,
  McpServersConfigSchema,
  McpServerEntryObjectSchema,
  McpServerEntrySchema,
  McpServersMapSchema,
  PacksConfigSchema,
  PackEntryObjectSchema,
  PackEntrySchema,
  PacksMapSchema,
  SETTINGS_KEY_ORDER,
  SettingsSchema,
  SkillsConfigSchema,
  SkillEntryObjectSchema,
  SkillEntrySchema,
  SkillsMapSchema,
  SubagentsConfigSchema,
  SubagentEntryObjectSchema,
  SubagentEntrySchema,
  SubagentsMapSchema,
  SourceHostConfigSchema,
  WorkspaceVarsMapSchema,
} from "./schema.js";

// Ignored patterns
export { normalizeIgnoredPatterns, validateIgnoredConfigConflicts } from "./ignored-patterns.js";

// Settings I/O
export {
  createDefaultSettings,
  orderSettingsKeys,
  SETTINGS_FILENAME,
  writeSettings,
} from "./settings.js";

// Format-preserving JSON
export type { JsonModification } from "./format-preserving-json.js";

// Lint configuration — `Settings.lint` composes the shared-kernel `LintConfig`
// schema; re-exported here so consumers importing from
// `@agentxm/client-core/unstable/settings` see the complete settings surface.
export type { LintConfig, LintRuleSeverity, LintRulesMap } from "../lint/config.js";
export {
  LintConfigSchema,
  LintRuleSeveritySchema,
  LintRulesMapSchema,
  platformCanonicalLintConfig,
  registerLintRuleIds,
  registeredLintRuleIds,
} from "../lint/config.js";
