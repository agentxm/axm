/**
 * Subagents extension kind: what the lifecycle feature and the application consume.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { SubagentDefinitionInvalid, SubagentNativeConflict } from "./errors.js";
export { planSubagentInstall, type SubagentInstallIntent } from "./lifecycle/install/plan.js";
export {
  parseSubagentUninstallRequest,
  planSubagentUninstall,
  type SubagentUninstallIntent,
} from "./lifecycle/uninstall/plan.js";
