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
  ParseSourceInputResult,
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

// Type guards
export { isGitHostingProviderSource } from "./utils.js";

// Provider types
export type {
  ExtensionFiles,
  ExtensionRef,
  FindOptions,
  McpServerRef,
  ProviderRegistry,
  SkillRef,
  SourceProvider,
} from "./provider.js";
export { RegistryError, RegistryNotConfiguredError, SourceError } from "./provider.js";

// Provider implementations
export type { RegistrySourceProvider } from "./providers/index.js";
export {
  createAzureReposProvider,
  createBitbucketProvider,
  createGitHubProvider,
  createGitLabProvider,
  createGitProvider,
  createLocalProvider,
  createLocalRegistryProvider,
  createRegistryProvider,
  createRemoteRegistryProvider,
} from "./providers/index.js";

// SourceProviders service
export type { SourceProvidersService } from "./service.js";
export { SourceProviders, SourceProvidersLive, createRegistryMetaProvider } from "./service.js";

// Errors
export { CloneUrlError, ParseError } from "./errors.js";

// Main parser
export { parseSourceInput } from "./parser.js";

// Source resolver
export { resolveSource } from "./resolve-source.js";

// Printer
export { printSourceInput } from "./printer.js";

// Clone URL utilities
export { buildCloneUrl, getOrigin } from "./clone-url.js";

// Git operations
export type { GitError } from "../git/index.js";
export {
  cloneRepo,
  getCurrentCommit,
  getTreeSha,
  isGitRepository,
  resolveRef,
  shallowClone,
} from "../git/index.js";

// GitHub API
export type { GitHubApiError } from "./github/index.js";
export { fetchGitHubTreeHash } from "./github/index.js";

// Registry guard
export { registryGuard } from "./registry-guard.js";
