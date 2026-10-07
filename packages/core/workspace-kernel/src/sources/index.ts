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
  SOURCE_ERROR_CATEGORIES,
  SourceHostNotConfigured,
  SourceNetworkFailure,
  SourceNotResolvable,
  SourceSyntaxInvalid,
  isSourceError,
  isSourceResolutionFailure,
  sourceResolutionFailureCategory,
  type GitOperation,
  type SourceError,
  type SourceErrorCategory,
  type SourceResolutionFailure,
} from "./errors.js";

// Provider implementations
export { createGitSourceHostProvider } from "./providers/git.js";
export { createLocalSourceHostProvider } from "./providers/local.js";
export {
  createLocalRegistrySourceHostProvider,
  createRegistrySourceHostProviderFromHost,
  createRemoteRegistrySourceHostProvider,
} from "./providers/registry/host-provider.js";

// SourceHostProviders service
export type { AcquiredSourceFiles, SourceHostProvidersService } from "./service.js";
export { SourceHostProviders, createRegistryMetaProvider } from "./service.js";

// Workspace catalog port (its workspace-backed Live ships through `./live`)
export {
  WorkspaceCatalog,
  WorkspaceCatalogUnavailable,
  type ConfiguredSourceHost,
  type DesiredExtensionGraphView,
  type DesiredExtensionNodeView,
  type SkillCandidates,
  type WorkspaceCatalogService,
} from "./workspace-catalog.js";

// Official AXM skill candidate gate port (implemented by the composition root)
export {
  AxmSkillCandidateGate,
  AxmSkillGateUnavailable,
  type AxmSkillCandidate,
  type AxmSkillCandidateGateService,
  type AxmSkillCandidateVerdict,
} from "./axm-skill-gate.js";

// Registry resolution policy port (implemented by the composition root)
export {
  RegistryResolutionPolicy,
  type RegistryResolutionPolicyService,
} from "./registry-resolution-policy.js";

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
export {
  resolveIdentifier,
  resolveInstalledIdentifier,
  resolveInstalledIdentifierNameOrInput,
  type IdentifierResolutionScope,
  type IdentifierResourceType,
  type ResolveIdentifierArgs,
  type ResolvedIdentifier,
} from "./resolve-identifier.js";
export { resolveSourcePattern } from "./resolve-source-pattern.js";
export {
  discoverExtensionPackages,
  inspectExtensionPackage,
  type DiscoveredExtensionPackage,
  type ExtensionPackageFilter,
} from "./package-discovery.js";
export {
  acquireExternalSource,
  findExtensionPackagesFromSource,
  findLocalOrGitExtensionPackagesFromSource,
  type AcquiredExternalSource,
  type ResolvedExtensionPackage,
} from "./package-sources.js";
export { discoverConventionRefs, pluginMcpPackageName } from "./providers/convention-discovery.js";
export { withPackRegistryIndexMemo } from "./providers/registry/index-memo.js";

// Locator utilities

// Git acquisition
export { findGitRoot, isGitManaged } from "./git/detect.js";
export {
  compareDirectoryToHead,
  getCommitSha,
  getExactTag,
  getRemoteUrl,
  getTreeSha,
  listRemoteRefs,
  shallowClone,
  type GitDirectoryComparisonResult,
  type GitDirectoryDifference,
  type GitRemoteRefs,
} from "./git/operations.js";
export {
  GitDirectoryComparison,
  type GitDirectoryComparisonInput,
  type GitDirectoryComparisonService,
} from "./git/directory-comparison.js";

// Registry install targets, the login hint, and the per-registry probe record.
export {
  parseRegistryInstallTarget,
  type BareRegistryInstallTarget,
  type ParseRegistryInstallTargetOptions,
  type QualifiedRegistryInstallTarget,
  type RegistryInstallTarget,
  type RegistryInstallTargetParseError,
} from "./registry-install-target.js";
export { registryLoginSuggestions } from "./registry-login-suggestion.js";
export { formatRegistryProbe, type RegistryLookupProbe } from "./registry-probe.js";

export {
  ArtifactHttpClient,
  downloadHttpArtifact,
  httpArtifactDigest,
  validateArtifactUrl,
} from "./http-download.js";

export { acquireHttpOffer, acquireAcceptedHttpPackage } from "./http-package.js";
export {
  parseWellKnownIndex,
  WELL_KNOWN_SCHEMA,
  type SkillArtifactOffer,
} from "./well-known-index.js";
