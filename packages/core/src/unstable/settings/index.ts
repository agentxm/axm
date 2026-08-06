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
  FilesEntry,
  FileInputValuesMap,
  FilesMap,
  GitHubSourceHostConfig,
  GitLabSourceHostConfig,
  HookEntry,
  HooksMap,
  KnowledgeEntry,
  KnowledgeConfig,
  KnowledgeMap,
  InstructionsConfig,
  InstructionsConfigValue,
  McpServerEntry,
  McpServersMap,
  MinimumReleaseAge,
  PackEntry,
  PacksMap,
  RegistrySourceHostConfig,
  RulesConfig,
  RuleEntry,
  RulesMap,
  Settings,
  SkillEntry,
  SkillsMap,
  SubagentEntry,
  SubagentsMap,
  SourceHostConfig,
  WorkspaceVarsMap,
} from "./schema.js";
export {
  CommandEntryObjectSchema,
  CommandEntrySchema,
  CommandsMapSchema,
  FilesEntryObjectSchema,
  FilesEntrySchema,
  FileInputValuesMapSchema,
  FilesMapSchema,
  HookEntryObjectSchema,
  HookEntrySchema,
  HooksMapSchema,
  KnowledgeEntryObjectSchema,
  KnowledgeEntrySchema,
  KnowledgeConfigSchema,
  KnowledgeMapSchema,
  InstructionsConfigSchema,
  McpServerEntryObjectSchema,
  McpServerEntrySchema,
  McpServersMapSchema,
  MinimumReleaseAgeSchema,
  PackEntryObjectSchema,
  PackEntrySchema,
  PacksMapSchema,
  RulesConfigSchema,
  RuleEntryObjectSchema,
  RuleEntrySchema,
  RulesMapSchema,
  SETTINGS_KEY_ORDER,
  SettingsSchema,
  SkillEntryObjectSchema,
  SkillEntrySchema,
  SkillsMapSchema,
  SubagentEntryObjectSchema,
  SubagentEntrySchema,
  SubagentsMapSchema,
  SourceHostConfigSchema,
  WorkspaceVarsMapSchema,
} from "./schema.js";

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
