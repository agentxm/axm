/**
 * Pack feature module for @axm.sh/core.
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
  PackDependencyConstraintMapSchema,
  PackManifestSchema,
  RawPackManifestSchema,
  type PackDependencyConstraintMap,
  type PackManifest,
  type RawPackManifest,
} from "./manifest-schema.js";

// Extension ref types
export type { RegistryPackRef, BuiltinPackRef, PackExtensionRef } from "./refs.js";

// Manager
export { PackManager, PackManagerLive } from "./manager.js";

// Paths
export { computePackPaths, type PackDirPath } from "./paths.js";

// Expansion helpers
export {
  expandPackInstallRefs,
  expandPackUninstallTargets,
  resolveSkillUninstallTargetsFromLockfile,
  type UninstallSettingsContext,
} from "./expansion.js";

// Reconciliation adapter
export { packReconciliationAdapter } from "./reconciliation-adapter.js";

// Operations
export type { InstallPackOperationArgs, InstallPackOperation } from "./operations/install.js";
export { installPack } from "./operations/install.js";
export type { UninstallPackOperationArgs, UninstallPackOperation } from "./operations/uninstall.js";
export { uninstallPack } from "./operations/uninstall.js";
export type { NewPackOperationArgs, NewPackOperation } from "./operations/new-pack.js";
export { newPack } from "./operations/new-pack.js";
export type { AddToPackOperationArgs, AddToPackOperation } from "./operations/add-to-pack.js";
export { addToPack } from "./operations/add-to-pack.js";
export type {
  RemoveFromPackOperationArgs,
  RemoveFromPackOperation,
} from "./operations/remove-from-pack.js";
export { removeFromPack } from "./operations/remove-from-pack.js";
export type { PublishPackOperationArgs, PublishPackOperation } from "./operations/publish.js";
export { publishPack } from "./operations/publish.js";
export type { UnpackPackOperationArgs, UnpackPackOperation } from "./operations/unpack.js";
export { unpackPack } from "./operations/unpack.js";
