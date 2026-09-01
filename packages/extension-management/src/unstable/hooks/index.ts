export {
  hookPackagesInDir,
  type DiscoveredHookPackage,
  type HookPackageDiscoveryOptions,
} from "./discovery.js";
export { HookManager, HookManagerLive } from "./manager.js";
export { evaluateHookAgentOutcome, type HookOutcomeTarget } from "./outcomes.js";
export type { NewHookOperation, NewHookOperationArgs } from "./operations/new-hook.js";
export { newHook } from "./operations/new-hook.js";

export {
  HookConfigInvalid,
  HookDefinitionInvalid,
  HookInstallStateMissing,
  HookIoFailed,
  type HookManagerError,
} from "./errors.js";
