/**
 * Instructions extension kind: what the lifecycle feature and the application consume.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { RuleDefinitionInvalid } from "./errors.js";
export { planRuleInstall, type RuleInstallIntent } from "./lifecycle/install/plan.js";
export {
  parseRuleUninstallRequest,
  planRuleUninstall,
  type RuleUninstallIntent,
} from "./lifecycle/uninstall/plan.js";
