/**
 * Source parsing and identification module.
 *
 * Provides functionality to parse various source formats (GitHub shorthand, URLs, etc.)
 * into normalized SourceInput structures.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Types — Source inputs (parsed coordinates)
export type {
  AzureReposSourceInput,
  BitbucketSourceInput,
  GitHubSourceInput,
  GitHostingProviderSource,
  GitLabSourceInput,
  GitRepositorySourceInput,
  GitSource,
  LocalSourceInput,
  RegistrySourceInput,
  SourceInput,
  SourceType,
} from "./types.js";
export { SourceTypeSchema } from "./types.js";

// Types — Source (input + config)
export type {
  AzureReposSource,
  BitbucketSource,
  GitHubSource,
  GitLabSource,
  GitRepositorySource,
  LocalSource,
  RegistrySource,
  Source,
} from "./types.js";

// Types — New domain model (source-host-domain-modeling)
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
  // New Source (flat intersection)
  BuiltinSource,
  GitBasedSource,
  GitHostingSource,
  NewAzureReposSource,
  NewBitbucketSource,
  NewGitHubSource,
  NewGitLabSource,
  NewGitSource,
  NewLocalSource,
  NewRegistrySource,
  NewSource,
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

// Provider types — legacy
export type {
  ExtensionFiles,
  FindOptions,
  McpServerRef,
  SkillRef,
  LegacySourceProvider,
} from "./provider.js";

// Provider types — new
export type { SourceHostProvider, PublishableSourceHostProvider } from "./provider.js";

// Provider implementations — legacy
export type { RegistrySourceProvider } from "./providers/index.js";
export {
  createLegacyAzureReposProvider,
  createBitbucketProvider,
  createGitHubProvider,
  createGitLabProvider,
  createLegacyGitProvider,
  createLegacyLocalProvider,
  createLocalRegistryProvider,
  createRegistryProvider,
  createRemoteRegistryProvider,
} from "./providers/index.js";

// Provider implementations — new (SourceHostProvider)
export {
  createAzureReposSourceHostProvider,
  createBitbucketSourceHostProvider,
  createBuiltinSourceHostProvider,
  createGitHostingSourceHostProvider,
  createGitHubSourceHostProvider,
  createGitLabSourceHostProvider,
  createGitSourceHostProvider,
  createLocalSourceHostProvider,
  createRegistrySourceHostProvider,
} from "./providers/index.js";

// SourceHostProviders service (new)
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
export { lockEntryToSourceParams, printSourceInput } from "./printer.js";

// GitHub API
export { fetchGitHubTreeHash } from "./github/index.js";

// Registry guard
export { registryGuard } from "./registry-guard.js";
