// Manager
export { SkillManagerLive } from "./manager.js";
export { ensureSkillAgentArtifact } from "./materialization.js";

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
