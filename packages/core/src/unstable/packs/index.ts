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
  PackManifestSchema,
  RawPackManifestSchema,
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
export type { InstallPackOperationArgs, InstallPackOperation } from "./operations/index.js";
export { installPack } from "./operations/index.js";
export type { UninstallPackOperationArgs, UninstallPackOperation } from "./operations/index.js";
export { uninstallPack } from "./operations/index.js";
export type { NewPackOperationArgs, NewPackOperation } from "./operations/index.js";
export { newPack } from "./operations/index.js";
export type { AddToPackOperationArgs, AddToPackOperation } from "./operations/index.js";
export { addToPack } from "./operations/index.js";
export type { RemoveFromPackOperationArgs, RemoveFromPackOperation } from "./operations/index.js";
export { removeFromPack } from "./operations/index.js";
export type { PublishPackOperationArgs, PublishPackOperation } from "./operations/index.js";
export { publishPack } from "./operations/index.js";
export type { UnpackPackOperationArgs, UnpackPackOperation } from "./operations/index.js";
export { unpackPack } from "./operations/index.js";
