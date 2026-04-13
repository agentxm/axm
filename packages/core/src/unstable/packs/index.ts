/**
 * Extension pack feature module for @agentxm/client-core.
 *
 * Provides extension pack manifest schemas, extension ref types, lifecycle manager,
 * path computation, expansion helpers, reconciliation adapter, and operations.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Manifest schemas
export {
  EXTENSION_PACK_MANIFEST_FILENAME,
  ExtensionPackManifestSchema,
  type ExtensionPackManifest,
} from "./manifest-schema.js";

// Extension ref types
export type { RegistryExtensionPackRef, ExtensionPackRef } from "./refs.js";

// Manager
export { ExtensionPackManager, ExtensionPackManagerLive } from "./manager.js";

// Paths
export { computeExtensionPackPaths, type ExtensionPackDirPath } from "./paths.js";

// Expansion helpers
export {
  expandExtensionPackInstallRefs,
  expandExtensionPackUninstallTargets,
  resolveSkillUninstallTargetsFromLockfile,
  type UninstallSettingsContext,
} from "./expansion.js";

// Reconciliation adapter
export { extensionPackReconciliationAdapter } from "./reconciliation-adapter.js";

// Operations
export type {
  InstallExtensionPackOperationArgs,
  InstallExtensionPackOperation,
} from "./operations/install.js";
export { installExtensionPack } from "./operations/install.js";
export type {
  UninstallExtensionPackOperationArgs,
  UninstallExtensionPackOperation,
} from "./operations/uninstall.js";
export { uninstallExtensionPack } from "./operations/uninstall.js";
export type {
  NewExtensionPackOperationArgs,
  NewExtensionPackOperation,
} from "./operations/new-pack.js";
export { newExtensionPack } from "./operations/new-pack.js";
export type {
  AddToExtensionPackOperationArgs,
  AddToExtensionPackOperation,
} from "./operations/add-to-pack.js";
export { addToExtensionPack } from "./operations/add-to-pack.js";
export type {
  RemoveFromExtensionPackOperationArgs,
  RemoveFromExtensionPackOperation,
} from "./operations/remove-from-pack.js";
export { removeFromExtensionPack } from "./operations/remove-from-pack.js";
export type {
  PublishExtensionPackOperationArgs,
  PublishExtensionPackOperation,
} from "./operations/publish.js";
export { publishExtensionPack } from "./operations/publish.js";
export type {
  UnpackExtensionPackOperationArgs,
  UnpackExtensionPackOperation,
} from "./operations/unpack.js";
export { unpackExtensionPack } from "./operations/unpack.js";
