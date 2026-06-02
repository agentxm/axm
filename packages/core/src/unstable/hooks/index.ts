/**
 * Hooks feature module.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 */

export {
  HOOK_EXTENSION_DIR,
  HOOK_MANIFEST_FILENAME,
  HOOK_MANIFEST_SCHEMA_URL,
  HookBindingSchema,
  HookCapabilitiesSchema,
  HookEventSchema,
  HookManifestSchema,
  HookRuntimeSchema,
  type HookBinding,
  type HookCapabilities,
  type HookEvent,
  type HookManifest,
  type HookRuntime,
} from "./manifest-schema.js";

export type { GitHostedHookRef, HookExtensionRef, LocalHookRef, RegistryHookRef } from "./refs.js";
export { buildRegistryHookRef } from "./registry-ref-builder.js";
export {
  hookPackagesInDir,
  type DiscoveredHookPackage,
  type HookPackageDiscoveryOptions,
} from "./discovery.js";
export { HookManager, HookManagerLive } from "./manager.js";
export type { PublishHookOperation, PublishHookOperationArgs } from "./operations/publish.js";
export { publishHook } from "./operations/publish.js";
