/**
 * Source parsing and identification module for @axm.sh/core.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Types — Core
export type { RefType, SourceType } from "./types.js";
export { RefTypeSchema, SourceTypeSchema } from "./types.js";

// Types — Source domain model
export type {
  // SourceHost
  AzureReposSourceHost,
  BitbucketSourceHost,
  BuiltinSourceHost,
  ConfiguredSourceHost,
  GitHostingSourceHost,
  GitHubSourceHost,
  GitLabSourceHost,
  GitSourceHost,
  LocalSourceHost,
  RegistrySourceHost,
  SelfDescribingSourceHost,
  SourceHost,
  // SourceParams
  AzureReposSourceParams,
  BitbucketSourceParams,
  BuiltinSourceParams,
  GitHubSourceParams,
  GitHostingSourceParams,
  GitLabSourceParams,
  GitSourceParams,
  LocalSourceParams,
  RegistrySourceParams,
  SourceParams,
  // Source (flat intersection)
  BuiltinSource,
  GitBasedSource,
  GitHostingSource,
  AzureReposSource,
  BitbucketSource,
  GitHubSource,
  GitLabSource,
  GitSource,
  LocalSource,
  RegistrySource,
  Source,
  // Ref details
  BuiltinRefDetails,
  GitHostedRefDetails,
  LocalRefDetails,
  RegistryRefDetails,
  // Extension ref base types
  ExtensionRefBase,
  SkillExtensionRefBase,
  CommandExtensionRefBase,
  McpServerExtensionRefBase,
  PackExtensionRefBase,
  // Skill extension refs
  GitHostedSkillRef,
  BuiltinSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  SkillExtensionRef,
  // Command extension refs
  GitHostedCommandRef,
  BuiltinCommandRef,
  LocalCommandRef,
  RegistryCommandRef,
  CommandExtensionRef,
  // MCP server extension refs
  GitHostedMcpServerRef,
  BuiltinMcpServerRef,
  LocalMcpServerRef,
  McpServerExtensionRef,
  RegistryMcpServerRef,
  // Pack extension refs
  BuiltinPackRef,
  PackExtensionRef,
  RegistryPackRef,
  // Union
  ExtensionRef,
} from "./types.js";

// Type guards and utilities
export { fileUrlToPath } from "./utils.js";

// Provider types
export type { ExtensionFiles, FindOptions, SourceHostProvider } from "./provider.js";

// Input pattern classifier
export { parseInputPattern } from "./parser.js";
export type { InputPattern, InputParseResult, ShorthandInput } from "./parser.js";

// Printer
export { lockEntryToSourceParams, printSourceParams } from "./printer.js";

// Source-to-lock-entry mapping
export { sourceToLockEntry, type SourceToLockEntryInput } from "./source-to-lock-entry.js";
