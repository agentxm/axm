/**
 * Skills feature module — types, schemas, manager, and operations.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Manifest schema
export { MANIFEST_FILENAME, SkillManifestSchema, type SkillManifest } from "./manifest-schema.js";

// Skill extension ref types
export type {
  GitHostedSkillRef,
  RegistrySkillRef,
  LocalSkillRef,
  WorkspaceSkillRef,
  SkillExtensionRef,
} from "./refs.js";

// Skill domain type
export type { Skill } from "./types.js";

// Skill content parsing
export { parseSkillMd, SkillFrontmatterSchema } from "./skill-content.js";

// Manager
export { SkillManager, SkillManagerLive } from "./manager.js";
export { ensureSkillAgentArtifact } from "./materialization.js";

// Paths
export { computeSkillPaths, type SkillPathSource, type SkillDirPaths } from "./paths.js";

// Utilities
export {
  getSkillDisplayName,
  getSkillFqn,
  isReferencedByPack,
  getReferencingPacks,
} from "./utils.js";

// Reconciliation
export { skillReconciliationAdapter } from "./reconciliation-adapter.js";

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
export type { PublishSkillOperationArgs, PublishSkillOperation } from "./operations/publish.js";
export { publishSkill } from "./operations/publish.js";
export type { CopySkillOperationArgs, CopySkillOperation } from "./operations/copy.js";
export { copySkill } from "./operations/copy.js";
export type { EnableSkillOperation } from "./operations/enable.js";
export { enableSkill } from "./operations/enable.js";
export type { DisableSkillOperation } from "./operations/disable.js";
export { disableSkill } from "./operations/disable.js";
export type { NewSkillOperationArgs, NewSkillOperation } from "./operations/new-skill.js";
export { newSkill } from "./operations/new-skill.js";
