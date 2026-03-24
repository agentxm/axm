// Re-export data layer from core
export * from "@axm.sh/core/unstable/sources";

// Provider implementations (CLI-specific)
export {
  createAzureReposSourceHostProvider,
  createBitbucketSourceHostProvider,
  createBuiltinSourceHostProvider,
  createGitHostingSourceHostProvider,
  createGitHubSourceHostProvider,
  createGitLabSourceHostProvider,
  createGitSourceHostProvider,
  createLocalSourceHostProvider,
  createLocalRegistrySourceHostProvider,
  createRegistrySourceHostProviderFromHost,
  createRemoteRegistrySourceHostProvider,
} from "./providers/index.js";

// SourceHostProviders service (CLI-specific)
export type { SourceHostProvidersService } from "./service.js";
export {
  SourceHostProviders,
  SourceHostProvidersLive,
  createRegistryMetaProvider,
} from "./service.js";

// Source resolver (CLI-specific)
export { resolveSource } from "./resolve-source.js";
export { resolveSourcePattern } from "./resolve-source-pattern.js";
