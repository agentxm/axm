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
  CommandsConfig,
  CommandEntry,
  CommandsMap,
  FilesEntry,
  FileInputValuesMap,
  FilesMap,
  GitHubSourceHostConfig,
  GitLabSourceHostConfig,
  HookEntry,
  HooksMap,
  InstructionsConfig,
  InstructionsConfigValue,
  McpServersConfig,
  McpServerEntry,
  McpServersMap,
  MinimumReleaseAge,
  PacksConfig,
  PackEntry,
  PacksMap,
  RegistrySourceHostConfig,
  RulesConfig,
  RuleEntry,
  RulesMap,
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
  CommandEntryObjectSchema,
  CommandEntrySchema,
  CommandsConfigSchema,
  CommandsMapSchema,
  FilesEntryObjectSchema,
  FilesEntrySchema,
  FileInputValuesMapSchema,
  FilesMapSchema,
  HookEntryObjectSchema,
  HookEntrySchema,
  HooksMapSchema,
  InstructionsConfigSchema,
  McpServersConfigSchema,
  McpServerEntryObjectSchema,
  McpServerEntrySchema,
  McpServersMapSchema,
  MinimumReleaseAgeSchema,
  PacksConfigSchema,
  PackEntryObjectSchema,
  PackEntrySchema,
  PacksMapSchema,
  RulesConfigSchema,
  RuleEntryObjectSchema,
  RuleEntrySchema,
  RulesMapSchema,
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
