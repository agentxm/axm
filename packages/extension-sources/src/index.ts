/**
 * AXM extension-source integration.
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
export type { CarriedFailureCategory } from "./failure-category.js";

// Provider implementations
export { createGitSourceHostProvider } from "./providers/git.js";
export { createGitHostingSourceHostProvider } from "./providers/git-hosting.js";
export { createLocalSourceHostProvider } from "./providers/local.js";
export {
  createLocalRegistrySourceHostProvider,
  createRegistrySourceHostProviderFromHost,
  createRemoteRegistrySourceHostProvider,
} from "./providers/registry/host-provider.js";

// SourceHostProviders service
export type { SourceHostProvidersService } from "./service.js";
export { SourceHostProviders, createRegistryMetaProvider } from "./service.js";

// Workspace catalog port (implemented by the composition root)
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
  type AcquiredExternalSource,
  type ResolvedExtensionPackage,
} from "./package-sources.js";

// Locator utilities
export { fileUrlToPath } from "./file-url.js";

// Git acquisition
export { findGitRoot, isGitManaged } from "./git/detect.js";
export {
  compareDirectoryToHead,
  getCommitSha,
  getTreeSha,
  shallowClone,
  type GitDirectoryComparisonResult,
  type GitDirectoryDifference,
} from "./git/operations.js";
export {
  GitDirectoryComparison,
  type GitDirectoryComparisonInput,
  type GitDirectoryComparisonService,
} from "./git/directory-comparison.js";
