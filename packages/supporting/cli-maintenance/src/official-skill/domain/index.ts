/** Official-skill compatibility rules, recovery outcomes, and recovery commands owned by CLI maintenance. */
export {
  AXM_SKILL_FQN,
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  type AxmSkillCompatibility,
  type AxmSkillCompatibilityCandidate,
  type AxmSkillSourceAuthority,
  type AxmSkillCompatibilityInput,
  validateAxmSkillCliVersionRange,
  evaluateAxmSkillCompatibility,
} from "./policy.js";
export {
  AXM_SKILL_BUNDLED_PREVIEW_COMMAND,
  AXM_SKILL_BUNDLED_APPLY_COMMAND,
  formatAxmSkillCompatibilityTarget,
  AxmSkillCompatibilityReportSchema,
  renderAxmSkillRecovery,
  renderAxmSkillCompatibility,
} from "./recovery.js";
export { AxmSkillIncompatible } from "./errors.js";
