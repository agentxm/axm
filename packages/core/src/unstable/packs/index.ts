/**
 * Pack feature module for @agentxm/client-core.
 *
 * Provides pack manifest schemas, extension ref types, lifecycle manager,
 * path computation, expansion helpers, reconciliation adapter, and operations.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Manifest schemas
export {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
  type PackManifest,
} from "./manifest-schema.js";

// Extension ref types
export type { RegistryPackRef, WorkspacePackRef, PackRef } from "./refs.js";
export {
  buildPackDependencyReachability,
  classifyPackDependencyReachability,
  packDependencyReachabilityByMember,
  type PackDependencyAuthority,
  type PackDependencyDeclaration,
  type PackDependencyMemberObservation,
  type PackDependencyReachability,
  type PackDependencyReachabilityClassification,
} from "./dependency-reachability.js";

// Manager
export { PackManager, PackManagerLive } from "./manager.js";

// Paths
export { computePackPathsForLayout, type PackDirPath } from "./paths.js";

// Expansion helpers
export {
  expandPackInstallRefs,
  expandPackInstallRefsWithReleaseAge,
  type ReleaseAgeAwarePackExpansion,
} from "./expansion.js";
export {
  resolvePackDependenciesWithReleaseAge,
  type PackDependencyRefResolver,
  type ReleaseAgeAwarePackDependencyResolution,
  type WorkspacePackDependencyResolver,
  type WorkspacePackDependencyResolution,
} from "./dependency-resolution.js";
export {
  ResolvedPackDependencyMapSchema,
  ResolvedPackDependencySchema,
  validateExactPackDependencyVersions,
  type ResolvedPackDependency,
  type ResolvedPackDependencyMap,
} from "./resolved-dependency.js";
export { computePackManifestContentIdentity } from "./manifest-content-identity.js";

// Operations
export {
  packManifestArtifact,
  packManifestPath,
  packManifestTarget,
} from "./operations/artifact.js";
export type { InstallPackOperationArgs, InstallPackOperation } from "./operations/install.js";
export { installPack } from "./operations/install.js";
export type { NewPackOperationArgs, NewPackOperation } from "./operations/new-pack.js";
export { newPack } from "./operations/new-pack.js";
export type { AddToPackOperationArgs, AddToPackOperation } from "./operations/add-to-pack.js";
export { addToPack } from "./operations/add-to-pack.js";
export type {
  RemoveFromPackOperationArgs,
  RemoveFromPackOperation,
} from "./operations/remove-from-pack.js";
export { removeFromPack } from "./operations/remove-from-pack.js";
