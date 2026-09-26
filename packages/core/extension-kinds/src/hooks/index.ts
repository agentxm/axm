/**
 * Hooks extension kind: what the lifecycle feature and the application consume.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { HookDefinitionInvalid } from "./errors.js";
export { planHookInstall, type HookInstallIntent } from "./lifecycle/install/plan.js";
export {
  parseHookUninstallRequest,
  planHookUninstall,
  type HookUninstallIntent,
} from "./lifecycle/uninstall/plan.js";
