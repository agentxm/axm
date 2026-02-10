/**
 * Source provider implementations.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { createAzureReposProvider } from "./azurerepos.js";
export { createGitProvider } from "./git.js";
export {
  createBitbucketProvider,
  createGitHostingProvider,
  createGitHubProvider,
  createGitLabProvider,
} from "./git-hosting.js";
export { createLocalProvider } from "./local.js";
export type { RegistrySourceProvider } from "./registry.js";
export {
  createLocalRegistryProvider,
  createRegistryProvider,
  createRemoteRegistryProvider,
} from "./registry.js";
