/**
 * Source parsing and identification module for @axm.sh/core.
 *
 * Source providers and parsing utilities. Extension ref types have moved
 * to their respective feature folders (skills/, commands/, mcp-servers/, packs/)
 * and are re-exported from the extensions module.
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
} from "./types.js";

// Ref base types (re-exported from extensions for backward compat)
export type {
  BuiltinRefDetails,
  GitHostedRefDetails,
  LocalRefDetails,
  RegistryRefDetails,
  ExtensionRefBase,
  SkillExtensionRefBase,
  CommandExtensionRefBase,
  McpServerExtensionRefBase,
  PackExtensionRefBase,
} from "../extensions/ref-base.js";

// Extension ref types (re-exported from extensions for backward compat)
export type {
  ExtensionRef,
  GitHostedSkillRef,
  BuiltinSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  SkillExtensionRef,
  GitHostedCommandRef,
  BuiltinCommandRef,
  LocalCommandRef,
  RegistryCommandRef,
  CommandExtensionRef,
  GitHostedMcpServerRef,
  BuiltinMcpServerRef,
  LocalMcpServerRef,
  McpServerExtensionRef,
  RegistryMcpServerRef,
  BuiltinPackRef,
  PackExtensionRef,
  RegistryPackRef,
} from "../extensions/refs.js";

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
