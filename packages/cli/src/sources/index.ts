/**
 * Source parsing and identification module.
 *
 * Provides functionality to parse various source formats (GitHub shorthand, URLs, etc.)
 * into normalized SourceParams structures.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Types — Core
export type { SourceType } from "./types.js";
export { SourceTypeSchema } from "./types.js";

// Types — Source domain model (source-host-domain-modeling)
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
  // FindableExtensionType
  FindableExtensionType,
  // Ref details
  BuiltinRefDetails,
  GitHostedRefDetails,
  LocalRefDetails,
  RegistryRefDetails,
  // Skill extension refs
  AzureReposSkillRef,
  BitbucketSkillRef,
  BuiltinSkillRef,
  GitHubSkillRef,
  GitLabSkillRef,
  GitSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  SkillExtensionRef,
  SkillRefBase,
  // MCP server extension refs
  BuiltinMcpServerRef,
  GitHubMcpServerRef,
  LocalMcpServerRef,
  McpServerExtensionRef,
  McpServerRefBase,
  RegistryMcpServerRef,
  // Pack extension refs
  BuiltinPackRef,
  PackExtensionRef,
  RegistryPackRef,
  // Union
  SourceExtensionRef,
} from "./types.js";

// Type guards
export { isGitHostingProviderSource } from "./utils.js";

// Provider types
export type {
  ExtensionFiles,
  FindOptions,
  SourceHostProvider,
  PublishableSourceHostProvider,
} from "./provider.js";

// Provider implementations
export type { RegistrySourceProvider } from "./providers/index.js";
export {
  createAzureReposSourceHostProvider,
  createBitbucketSourceHostProvider,
  createBuiltinSourceHostProvider,
  createGitHostingSourceHostProvider,
  createGitHubSourceHostProvider,
  createGitLabSourceHostProvider,
  createGitSourceHostProvider,
  createLocalSourceHostProvider,
  createLocalRegistryProvider,
  createRegistryProvider,
  createRegistrySourceHostProvider,
  createRemoteRegistryProvider,
} from "./providers/index.js";

// SourceHostProviders service
export type { SourceHostProvidersService } from "./service.js";
export {
  SourceHostProviders,
  SourceHostProvidersLive,
  createRegistryMetaProvider,
} from "./service.js";

// Input pattern classifier
export { parseInputPattern } from "./parser.js";
export type { InputPattern } from "./parser.js";

// Source resolver
export { resolveSource } from "./resolve-source.js";
export { resolveSourcePattern } from "./resolve-source-pattern.js";

// Printer
export { lockEntryToSourceParams, printSourceParams } from "./printer.js";

// GitHub API
export { fetchGitHubTreeHash } from "./github/index.js";

// Registry guard
export { registryGuard } from "./registry-guard.js";
