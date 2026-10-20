/**
 * AXM workspace source adapters.
 *
 * Provides source host providers, source resolution, identifier resolution,
 * package discovery, multi-source pattern resolution, and git acquisition.
 * The environment-backed `SourceHostProvidersLive` layer ships separately
 * through the `./live` export.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Failure vocabulary
export {
  GitOperationFailed,
  SourceHostNotConfigured,
  SourceNetworkFailure,
  SourceNotResolvable,
  SourceSyntaxInvalid,
  isSourceResolutionFailure,
  sourceResolutionFailureCategory,
  type SourceResolutionFailure,
} from "./errors.js";

// Provider implementations
export { createGitSourceHostProvider } from "./providers/git.js";
export { createLocalSourceHostProvider } from "./providers/local.js";
export { createRemoteRegistrySourceHostProvider } from "./providers/registry/host-provider.js";

// SourceHostProviders service
export type { SourceHostProvidersService } from "./service.js";
export { SourceHostProviders } from "./service.js";

// Workspace catalog port (its workspace-backed Live ships through `./live`)
export { WorkspaceCatalog, WorkspaceCatalogUnavailable } from "./workspace-catalog.js";

// Official AXM skill candidate gate port (implemented by the composition root)
export {
  AxmSkillCandidateGate,
  AxmSkillGateUnavailable,
  type AxmSkillCandidateVerdict,
} from "./axm-skill-gate.js";

// Registry resolution policy port (implemented by the composition root)
export { RegistryResolutionPolicy } from "./registry-resolution-policy.js";

// Source resolver
export {
  resolveSource,
  resolveShorthandInputSource,
  resolveSlashInputSource,
  routeUrlInput,
  routeScpInput,
} from "./resolve-source.js";
export {
  resolveIdentifier,
  resolveInstalledIdentifierNameOrInput,
  type IdentifierResourceType,
} from "./resolve-identifier.js";
export {
  discoverExtensionPackages,
  inspectExtensionPackage,
  type ExtensionPackageFilter,
} from "./package-discovery.js";
export {
  acquireExternalSource,
  findExtensionPackagesFromSource,
  findLocalOrGitExtensionPackagesFromSource,
  type ResolvedExtensionPackage,
} from "./package-sources.js";
export { discoverConventionRefs, pluginMcpPackageName } from "./providers/convention-discovery.js";
export { withPackRegistryIndexMemo } from "./providers/registry/index-memo.js";

// Locator utilities

// Git acquisition
export { observeGitIgnoreInputs } from "./git/ignore-inputs.js";
export {
  getExactTag,
  getRemoteUrl,
  listRemoteRefs,
  shallowClone,
  type GitDirectoryDifference,
  type GitRemoteRefs,
} from "./git/operations.js";
export {
  GitDirectoryComparison,
  type GitDirectoryComparisonService,
} from "./git/directory-comparison.js";

// Registry install targets, the login hint, and the per-registry probe record.
export { parseRegistryInstallTarget } from "./registry-install-target.js";
export { registryLoginSuggestions } from "./registry-login-suggestion.js";
export { formatRegistryProbe, type RegistryLookupProbe } from "./registry-probe.js";

export { ArtifactHttpClient, downloadHttpArtifact, httpArtifactDigest } from "./http-download.js";

export { parseWellKnownIndex, WELL_KNOWN_SCHEMA } from "./well-known-index.js";

// Dependents' inferred types name these, so their declaration emit must be
// able to; knip skips exports tagged public.
/** @public */
export type { AcquiredSourceFiles } from "./service.js";
