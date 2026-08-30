// Skill extension ref types
export type {
  GitHostedSkillRef,
  RegistrySkillRef,
  LocalSkillRef,
  WorkspaceSkillRef,
  SkillExtensionRef,
} from "./refs.js";
export {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  AXM_SKILL_BUNDLED_APPLY_COMMAND,
  AXM_SKILL_BUNDLED_PREVIEW_COMMAND,
  AXM_SKILL_FQN,
  AXM_SKILL_REGISTRY_APPLY_COMMAND,
  AXM_SKILL_REGISTRY_PREVIEW_COMMAND,
  AxmSkillCompatibilityPolicy,
  AxmSkillCompatibilityReasonSchema,
  AxmSkillCompatibilityRecoveryActionSchema,
  AxmSkillCompatibilityRecoverySchema,
  AxmSkillCompatibilityRecoveryStepSchema,
  AxmSkillCompatibilitySchema,
  evaluateAxmSkillCompatibility,
  formatAxmSkillCompatibilityTarget,
  makeAxmSkillCompatibilityPolicyLayer,
  validateAxmSkillCliVersionRange,
  type AxmSkillCliVersionRangeValidation,
  type AxmSkillCompatibility,
  type AxmSkillCompatibilityCandidate,
  type AxmSkillCompatibilityInput,
  type AxmSkillCompatibilityPolicyInput,
  type AxmSkillCompatibilityPolicyService,
  type AxmSkillCompatibilityReason,
  type AxmSkillCompatibilityRecovery,
  type AxmSkillCompatibilityRecoveryAction,
  type AxmSkillCompatibilityRecoveryStep,
} from "./axm-skill-compatibility.js";
export {
  readAxmSkillWorkspaceCompatibility,
  type ReadAxmSkillWorkspaceCompatibilityArgs,
} from "./axm-skill-workspace-compatibility.js";
export {
  evaluateAxmSkillCandidate,
  validateAxmSkillCandidate,
  type ValidateAxmSkillCandidateArgs,
} from "./axm-skill-candidate.js";

// Manager
export { SkillManager, SkillManagerLive } from "./manager.js";
export { ensureSkillAgentArtifact } from "./materialization.js";

// Paths
export { computeSkillPathsForLayout, type SkillPathSource, type SkillDirPaths } from "./paths.js";

// Utilities
export { getSkillDisplayName } from "./utils.js";

// Registry ref builder

// Operations
export type {
  InstallSkillOperationArgs,
  InstallSkillOperation,
  InstallableSkillTarget,
  InstallableSkillTargetLocation,
} from "./operations/install.js";
export {
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  computeSkillSourceHash,
  gitHostedSkillArtifactSource,
  groupInstallTargetsByDirectory,
  installSkill,
  skillArtifactFromTargets,
} from "./operations/install.js";
export type { InstallResult } from "./operations/install-result.js";
export type {
  UninstallSkillOperationArgs,
  UninstallSkillOperation,
} from "./operations/uninstall.js";
export { uninstallSkill } from "./operations/uninstall.js";
export type { EnableSkillOperation } from "./operations/enable.js";
export { enableSkill } from "./operations/enable.js";
export type { DisableSkillOperation } from "./operations/disable.js";
export { disableSkill } from "./operations/disable.js";
export type { NewSkillOperationArgs, NewSkillOperation } from "./operations/new-skill.js";
export { newSkill } from "./operations/new-skill.js";
