// Manager
export { PackManagerLive } from "./manager.js";

// Paths

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
