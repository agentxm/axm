/**
 * Source provider implementations.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { createAzureReposProvider } from "./azurerepos.js";
export { createBuiltinSourceHostProvider } from "./builtin.js";
export { createGitProvider, createGitSourceHostProvider } from "./git.js";
export {
  createAzureReposSourceHostProvider,
  createBitbucketProvider,
  createBitbucketSourceHostProvider,
  createGitHostingProvider,
  createGitHostingSourceHostProvider,
  createGitHubProvider,
  createGitHubSourceHostProvider,
  createGitLabProvider,
  createGitLabSourceHostProvider,
} from "./git-hosting.js";
export { createLocalProvider, createLocalSourceHostProvider } from "./local.js";
export type { RegistrySourceProvider } from "./registry.js";
export {
  createLocalRegistryProvider,
  createRegistryProvider,
  createRegistrySourceHostProvider,
  createRemoteRegistryProvider,
} from "./registry.js";
