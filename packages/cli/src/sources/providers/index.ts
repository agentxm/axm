/**
 * Source provider implementations.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { createLegacyAzureReposProvider } from "./azurerepos.js";
export { createBuiltinSourceHostProvider } from "./builtin.js";
export { createLegacyGitProvider, createGitSourceHostProvider } from "./git.js";
export {
  createAzureReposSourceHostProvider,
  createBitbucketProvider,
  createBitbucketSourceHostProvider,
  createLegacyGitHostingProvider,
  createGitHostingSourceHostProvider,
  createGitHubProvider,
  createGitHubSourceHostProvider,
  createGitLabProvider,
  createGitLabSourceHostProvider,
} from "./git-hosting.js";
export { createLegacyLocalProvider, createLocalSourceHostProvider } from "./local.js";
export type { RegistrySourceProvider } from "./registry.js";
export {
  createLocalRegistryProvider,
  createRegistryProvider,
  createRegistrySourceHostProvider,
  createRemoteRegistryProvider,
} from "./registry.js";
