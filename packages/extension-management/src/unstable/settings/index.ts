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
  AzureReposSourceHostConfig,
  BitbucketSourceHostConfig,
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
  MinimumReleaseAgeExclude,
  PackEntry,
  PacksMap,
  RegistrySourceHostConfig,
  RuleEntry,
  RulesMap,
  Settings,
  SkillEntry,
  SkillsMap,
  SubagentEntry,
  SubagentsMap,
  SourceHostConfig,
  WorkspacePublishOptions,
} from "./schema.js";
export {
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
  WorkspacePublishOptionsSchema,
} from "./schema.js";

// Settings I/O
export { createDefaultSettings, writeSettingsAtPath } from "./settings.js";

// Format-preserving JSON
export type { JsonModification } from "./format-preserving-json.js";
