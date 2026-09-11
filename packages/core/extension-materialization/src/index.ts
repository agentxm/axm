/**
 * @agentxm/extension-materialization public API.
 *
 * The materialization capability: the per-extension-type manager contract and
 * service tags, the per-type failure families, canonical package staging and
 * swap, registry-backed acquisition, and the install, materialize, uninstall,
 * and authored-package closure recipes that compose a manager into one plan
 * step. Environment-backed manager layers live behind `./live`; in-memory
 * managers for feature tests live behind `./testing`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Manager contract
export {
  NO_MATERIALIZATION_OBSERVATION,
  type ExtensionManager,
  type ManagerRequirements,
  type MaterializationFacts,
  type MaterializationObservation,
} from "./manager-contract.js";

// The seven managers under one lookup, for use cases that decide the
// extension type at runtime.
export { ExtensionManagers, type ExtensionManagersService } from "./manager-registry.js";

// Manager service tags and the facts each manager reports
export {
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
  RuleManager,
  SkillManager,
  SubagentManager,
  type AcquiredContentFacts,
  type HookManagerService,
  type HookMaterializationFacts,
  type KnowledgeManagerService,
  type KnowledgeMaterializationFacts,
  type KnowledgeSyncResult,
  type McpServerMaterializationFacts,
  type PackMaterializationFacts,
  type RuleManagerService,
  type RuleMaterializationFacts,
  type SkillMaterializationFacts,
  type SubagentManagerService,
  type SubagentMaterializationFacts,
} from "./managers.js";

// Failure vocabulary
export type { ExtensionManagerFailure, ExtensionMaterializationError } from "./errors.js";
export {
  ArchiveIntegrityMismatch,
  CanonicalPackageProbeFailed,
  CreateDestinationExists,
  LifecyclePostconditionViolated,
  PackageCopyFailed,
  PackageMaterializationFailed,
  ScaffoldedExtensionUnresolved,
  StagedPackageInvalid,
  type MaterializationError,
} from "./extensions/errors.js";
export {
  HookDefinitionInvalid,
  HookInstallStateMissing,
  type HookManagerError,
} from "./hooks/errors.js";
export {
  RuleDefinitionInvalid,
  RuleInstallStateMissing,
  type RuleManagerError,
} from "./rules/errors.js";
export {
  McpAgentSyncRefused,
  McpCanonicalPathUnsafe,
  McpInstallStateMissing,
  McpLocalNameConflict,
  McpRegistryOnlyInstall,
  McpRequiredInputsMissing,
  McpWorkspacePackageInvalid,
  type McpAgentSyncFault,
  type McpManagerError,
  type McpWorkspacePackageFault,
} from "./mcps/errors.js";
export {
  SubagentContentUnreadable,
  SubagentDefinitionInvalid,
  SubagentInstallStateMissing,
  type SubagentManagerError,
} from "./subagents/errors.js";
export {
  SkillDefinitionInvalid,
  SkillInstallStateMissing,
  SkillMaterializationFailed,
  type SkillManagerError,
} from "./skills/errors.js";
export {
  PackArchiveFetchFailed,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackStagingFailed,
  type PackManagerError,
} from "./packs/errors.js";
export {
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeInstallStateMissing,
  KnowledgeIoFailed,
  KnowledgeObservableContractViolated,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
  type KnowledgeManagerError,
} from "./knowledge/errors.js";

// MCP server installation: the operation four surfaces share, its credential
// port, and the artifact/target vocabulary the plan step reports.
export {
  collectSecretInputNames,
  deleteMcpSecrets,
  installMcpServer,
  readMcpServerManifest,
  type InstallMcpServerOperation,
  type InstallMcpServerOperationArgs,
  type McpSecretDeletionOutcome,
  type McpServerInstallRequirements,
} from "./mcps/install-operation.js";
export { materializeAuthoredMcpServer } from "./mcps/authored-materialization.js";
export {
  NativeMcpEntryRetirementFailed,
  retireNativeMcpEntry,
  type NativeMcpEntryRef,
} from "./mcps/native-entry.js";
export {
  MCP_SECRET_SERVICE,
  McpSecretStore,
  mcpSecretAccount,
  type McpSecretEraseOutcome,
  type McpSecretIdentity,
  type McpSecretStoreService,
  type McpSecretWriteOutcome,
} from "./mcps/secret-store.js";
export {
  MCP_AGENT_CONFIG_SURFACE,
  agentConfigTarget,
  agentConfigTargets,
  mcpConfigSurface,
  mcpServerArtifact,
  mcpServerSourcePath,
  mcpServerVersion,
  mcpSettingsTarget,
  mcpSourceTarget,
  type AgentMcpConfigOutcome,
} from "./mcps/artifact.js";

// Per-type materialization vocabulary
export { buildSubagentLockEntry } from "./subagents/lock-entry-builder.js";
export {
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  groupInstallTargetsByDirectory,
  skillArtifactFromTargets,
  type InstallableSkillTarget,
  type InstallableSkillTargetLocation,
} from "./skills/skill-artifact.js";
export { computeSkillSourceHash } from "./skills/source-hash.js";
export { ensureSkillAgentArtifact, removeSkillAgentArtifact } from "./skills/materialization.js";

// Canonical package staging, copy, reuse, and on-disk materializability
export {
  copyExtensionDirectory,
  formatCopyExtensionDirectoryFailure,
  type CopyExtensionDirectoryFailureDetails,
  type CopyExtensionDirectoryOptions,
} from "./extensions/copy-directory.js";
export { shouldReuseCanonicalInstall } from "./extensions/canonical-reuse.js";
export {
  configuredMcpServersToDiskRefs,
  configuredPacksToDiskRefs,
  configuredSkillsToDiskRefs,
  configuredSubagentsToDiskRefs,
} from "./extensions/materializable-from-disk.js";
export {
  canReuseExternalPackage,
  canReuseInstalledPackage,
  canonicalMaterializationPaths,
  createCanonicalDirectory,
  materializeExternalPackage,
  materializeExternalPackageWithTreeIntegrity,
  recoverCanonicalDirectory,
  replaceCanonicalDirectory,
  replaceCanonicalDirectoryWithInspection,
  type CanReuseExternalPackageArgs,
  type CanReuseInstalledPackageArgs,
  type CanonicalDirectoryInspection,
  type CanonicalDirectoryReplacementError,
  type CreateCanonicalDirectoryArgs,
  type MaterializeExternalPackageArgs,
  type MaterializedPackage,
  type RecoverCanonicalDirectoryArgs,
  type ReplaceCanonicalDirectoryArgs,
  type ReplaceCanonicalDirectoryWithInspectionArgs,
} from "./extensions/canonical-directory.js";

// Registry-backed acquisition
export {
  materializeRegistryPackage,
  materializeRegistryPackageWithTreeIntegrity,
  type MaterializeRegistryPackageArgs,
  type RegistryPackageMaterializationMessages,
} from "./registry-materialization.js";

// Closure recipes
export {
  buildAuthoredExtensionStep,
  buildInstallOperation,
  buildMaterializeOperation,
  buildNewExtensionStep,
  buildUninstallOperation,
  extensionRefLifecycleWarnings,
  extensionRefRegistryLifecycle,
  formatPackageUrlParts,
  targetFromRef,
  toLabel,
  toLabelWithCompanions,
  toStepKey,
  type AuthoredExtensionOperationArgs,
  type CallerStepFailure,
  type InstallOperationArgs,
  type MaterializeOperationArgs,
  type NewExtensionOperationArgs,
  type RecipeRequirements,
  type StepFailureAdapter,
  type UninstallOperationArgs,
  type UninstallRetentionPolicy,
  type UninstallSettlement,
  type UnreadablePackageRetirement,
} from "./extensions/operations.js";

// Re-materializing content the workspace already accepted. Both the sync
// sweep and Pack activation restore retained members, and neither feature may
// import the other.
export { RetainedContentUnusable } from "./desired-state/errors.js";
export {
  collectRetainedMaterializeSteps,
  type RetainedMaterializeFailure,
  type RetainedMaterializeRequirements,
  type RetainedMaterializeSteps,
  type RunRetainedMcpServerInstall,
} from "./desired-state/retained-materialization.js";
export { projectionErrorToStepFailure } from "./projection-step-failure.js";
