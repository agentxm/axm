/**
 * Extension-lifecycle feature: install, update, uninstall, enable, and
 * disable policy across root and type-specific command forms — configured
 * entry resolution, the shared install/uninstall command workflows, and the
 * per-type lifecycle operations. The environment-backed per-type manager
 * layers live behind `./live`.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { ExtensionLifecycleFailed } from "./errors.js";
export {
  LifecycleFailureAdapter,
  withAdaptedStepFailures,
  type LifecycleFailureAdapterService,
} from "./failure-adapter.js";
export {
  LifecycleResolutionProgress,
  type LifecycleResolutionProgressService,
} from "./resolution-progress.js";

export {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRegistryEntry,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
} from "./configured-entry-resolution.js";

export {
  CONFIGURED_ENTRY_RESOLUTION_TIMEOUT,
  withConfiguredEntryResolutionTimeout,
} from "./resolution-timeout.js";

export {
  buildInstallCommandPlan,
  runInstallCommandWorkflow,
  type InstallExtensionCommandWorkflowActions,
} from "./workflows/install-command/workflow.js";
export {
  runUninstallCommandWorkflow,
  type UninstallExtensionCommandWorkflowActions,
  type UninstallWorkflowFlags,
} from "./workflows/uninstall-command/workflow.js";

export {
  materializeRegistryPackage,
  materializeRegistryPackageWithTreeIntegrity,
  type MaterializeRegistryPackageArgs,
  type RegistryPackageMaterializationMessages,
} from "./registry-materialization.js";

// Skill lifecycle operations
export { ensureSkillAgentArtifact, removeSkillAgentArtifact } from "./skills/materialization.js";
export { getSkillDisplayName } from "./skills/utils.js";
export {
  computeSkillSourceHash,
  gitHostedSkillArtifactSource,
  installSkill,
  type InstallSkillOperation,
  type InstallSkillOperationArgs,
} from "./skills/operations/install.js";
export type { InstallResult } from "./skills/operations/install-result.js";
export {
  uninstallSkill,
  type UninstallSkillOperation,
  type UninstallSkillOperationArgs,
} from "./skills/operations/uninstall.js";
export { enableSkill, type EnableSkillOperation } from "./skills/operations/enable.js";
export { disableSkill, type DisableSkillOperation } from "./skills/operations/disable.js";

// MCP server lifecycle operations
export {
  installMcpServer,
  type InstallMcpServerOperation,
  type InstallMcpServerOperationArgs,
} from "./mcps/operations/install.js";
export {
  uninstallMcpServer,
  type UninstallMcpServerOperation,
  type UninstallMcpServerOperationArgs,
} from "./mcps/operations/uninstall.js";
export { enableMcpServer, type EnableMcpServerOperation } from "./mcps/operations/enable.js";
export { disableMcpServer, type DisableMcpServerOperation } from "./mcps/operations/disable.js";
export {
  mcpServerArtifact,
  mcpSettingsTarget,
  mcpSourceTarget,
} from "./mcps/operations/artifact.js";

// Subagent lifecycle operations
export {
  SUBAGENT_CONFIG_SURFACE,
  renderedSubagentTargets,
  subagentConfigTarget,
  subagentLifecycleArtifact,
} from "./subagents/operations/artifact.js";
export { enableSubagent, type EnableSubagentOperation } from "./subagents/operations/enable.js";
export { disableSubagent, type DisableSubagentOperation } from "./subagents/operations/disable.js";

// Pack lifecycle operations
export {
  expandPackInstallRefs,
  expandPackInstallRefsWithReleaseAge,
  type ReleaseAgeAwarePackExpansion,
} from "./packs/expansion.js";
export {
  resolvePackDependenciesWithReleaseAge,
  type PackDependencyRefResolver,
  type ReleaseAgeAwarePackDependencyResolution,
  type WorkspacePackDependencyResolution,
  type WorkspacePackDependencyResolver,
} from "./packs/dependency-resolution.js";
export {
  ResolvedPackDependencyMapSchema,
  ResolvedPackDependencySchema,
  validateExactPackDependencyVersions,
  type ResolvedPackDependency,
  type ResolvedPackDependencyMap,
} from "./packs/resolved-dependency.js";
export {
  installPack,
  type InstallPackOperation,
  type InstallPackOperationArgs,
} from "./packs/operations/install.js";
