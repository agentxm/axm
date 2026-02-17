/**
 * Source provider implementations.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { createBuiltinSourceHostProvider } from "./builtin.js";
export { createGitSourceHostProvider } from "./git.js";
export {
  createAzureReposSourceHostProvider,
  createBitbucketSourceHostProvider,
  createGitHostingSourceHostProvider,
  createGitHubSourceHostProvider,
  createGitLabSourceHostProvider,
} from "./git-hosting.js";
export { createLocalSourceHostProvider } from "./local.js";
export {
  createLocalRegistrySourceHostProvider,
  createRegistrySourceHostProviderFromHost,
  createRemoteRegistrySourceHostProvider,
} from "./registry/index.js";
