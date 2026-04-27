/**
 * Source resolution module.
 *
 * Provides source host providers, source resolution, skill discovery,
 * and multi-source pattern resolution.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Provider implementations
export { createGitSourceHostProvider } from "./providers/git.js";
export {
  createAzureReposSourceHostProvider,
  createBitbucketSourceHostProvider,
  createGitHostingSourceHostProvider,
  createGitHubSourceHostProvider,
  createGitLabSourceHostProvider,
} from "./providers/git-hosting.js";
export { createLocalSourceHostProvider } from "./providers/local.js";
export {
  createLocalRegistrySourceHostProvider,
  createRegistrySourceHostProviderFromHost,
  createRemoteRegistrySourceHostProvider,
} from "./providers/registry/host-provider.js";

// SourceHostProviders service
export type { SourceHostProvidersService } from "./service.js";
export {
  SourceHostProviders,
  SourceHostProvidersLive,
  createRegistryMetaProvider,
} from "./service.js";

// Source resolver
export {
  resolveSource,
  resolveShorthandInputSource,
  resolveSlashInputSource,
  routeUrlInput,
  routeScpInput,
  routeNameInput,
  routeRegistryInput,
} from "./resolve-source.js";
export { resolveSourcePattern } from "./resolve-source-pattern.js";
