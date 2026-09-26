/**
 * Skills extension kind: what the lifecycle feature and the application consume.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { SkillDefinitionInvalid, SkillMaterializationFailed } from "./errors.js";
export {
  buildCompanionPackagesSection,
  planSkillInstall,
  type SkillInstallIntent,
} from "./lifecycle/install/plan.js";
export {
  BundledAxmSkillAsset,
  installBundledAxmSkill,
  planBundledAxmSkillInstall,
} from "./lifecycle/install/bundled.js";
export {
  parseSkillUninstallRequest,
  planSkillUninstall,
  type SkillUninstallIntent,
} from "./lifecycle/uninstall/plan.js";
