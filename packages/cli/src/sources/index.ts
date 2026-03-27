/**
 * Source resolution module.
 *
 * Re-exports from @axm.sh/core/unstable/source-resolution.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Provider implementations
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
} from "@axm.sh/core/unstable/source-resolution";

// SourceHostProviders service
export type { SourceHostProvidersService } from "@axm.sh/core/unstable/source-resolution";
export {
  SourceHostProviders,
  SourceHostProvidersLive,
  createRegistryMetaProvider,
} from "@axm.sh/core/unstable/source-resolution";

// Source resolver
export { resolveSource } from "@axm.sh/core/unstable/source-resolution";
export { resolveSourcePattern } from "@axm.sh/core/unstable/source-resolution";
