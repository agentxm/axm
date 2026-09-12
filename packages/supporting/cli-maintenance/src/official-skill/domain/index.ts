/** Official-skill compatibility rules and recovery outcomes owned by CLI maintenance. */
export {
  AXM_SKILL_FQN,
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  AxmSkillCompatibilityReasonSchema,
  type AxmSkillCompatibilityReason,
  AxmSkillCompatibilityRecoveryActionSchema,
  type AxmSkillCompatibilityRecoveryAction,
  AxmSkillCompatibilityRecoverySchema,
  type AxmSkillCompatibilityRecovery,
  AxmSkillCompatibilitySchema,
  type AxmSkillCompatibility,
  type AxmSkillCompatibilityCandidate,
  type AxmSkillCompatibilityInput,
  type AxmSkillCliVersionRangeValidation,
  validateAxmSkillCliVersionRange,
  evaluateAxmSkillCompatibility,
} from "./policy.js";
export { AxmSkillIncompatible } from "./errors.js";
