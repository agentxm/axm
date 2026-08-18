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

export type {
  GitHostedHookRef,
  HookExtensionRef,
  LocalHookRef,
  RegistryHookRef,
  WorkspaceHookRef,
} from "./refs.js";
export {
  hookPackagesInDir,
  type DiscoveredHookPackage,
  type HookPackageDiscoveryOptions,
} from "./discovery.js";
export { HookManager, HookManagerLive } from "./manager.js";
export { evaluateHookAgentOutcome, type HookOutcomeTarget } from "./outcomes.js";
export type { NewHookOperation, NewHookOperationArgs } from "./operations/new-hook.js";
export { newHook } from "./operations/new-hook.js";
