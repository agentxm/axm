/**
 * Knowledge extension kind: what the lifecycle feature and the application consume.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeIoFailed,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
} from "./errors.js";
export { planKnowledgeInstall, type KnowledgeInstallIntent } from "./lifecycle/install/plan.js";
export {
  parseKnowledgeUninstallRequest,
  planKnowledgeUninstall,
  type KnowledgeUninstallIntent,
} from "./lifecycle/uninstall/plan.js";
