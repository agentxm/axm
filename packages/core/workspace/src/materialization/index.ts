/**
 * @agentxm/workspace/materialization public API.
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
  type ManagerRequirements,
  type MaterializationFacts,
  type MaterializationObservation,
} from "./manager-contract.js";

// Manager service tags and the facts each manager reports
export {
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
  type PackManagerService,
  RuleManager,
  SkillManager,
  type SkillManagerService,
  SubagentManager,
  type AcquiredContentFacts,
  type HookManagerService,
  type PreparedHookProjection,
  type HookMaterializationFacts,
  type KnowledgeManagerService,
  type KnowledgeMaterializationFacts,
  type KnowledgeSyncResult,
  type McpServerMaterializationFacts,
  type McpServerManagerService,
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
  PackageCopyFailed,
  PackageMaterializationFailed,
  StagedPackageInvalid,
  type MaterializationError,
} from "../acquisition/errors.js";
export {
  acceptedResolutionFor,
  InstallStateMissing,
  type AcceptedResolution,
  type AcquiredContentIdentity,
} from "./accepted-resolution.js";
export { HookDefinitionInvalid, type HookManagerError } from "../hooks/errors.js";
export { RuleDefinitionInvalid, type RuleManagerError } from "../instructions/errors.js";
export {
  McpAgentSyncRefused,
  McpCanonicalPathUnsafe,
  McpInstallStateMissing,
  McpRequiredInputsMissing,
  McpWorkspacePackageInvalid,
  type McpAgentSyncFault,
  type McpManagerError,
  type McpWorkspacePackageFault,
} from "../mcp-connections/errors.js";
export { McpConnectionConflict } from "../mcp-connections/lifecycle/domain/source-admission.js";
export {
  SubagentContentUnreadable,
  SubagentDefinitionInvalid,
  type SubagentManagerError,
} from "../subagents/errors.js";
export {
  SkillDefinitionInvalid,
  SkillMaterializationFailed,
  type SkillManagerError,
} from "../skills/errors.js";
export {
  PackArchiveFetchFailed,
  PackDefinitionInvalid,
  PackInstallStateMissing,
  PackStagingFailed,
  type PackManagerError,
} from "../packs/errors.js";
export {
  KnowledgeDefinitionInvalid,
  KnowledgeDesiredStateUnreconcilable,
  KnowledgeIoFailed,
  KnowledgeResolutionMissing,
  KnowledgeUnavailable,
  type KnowledgeManagerError,
} from "../knowledge/errors.js";

// MCP server installation: the operation four surfaces share, its credential
// port, and the artifact/target vocabulary the plan step reports.

export {
  MCP_SECRET_SERVICE,
  McpSecretStore,
  mcpSecretAccount,
  type McpSecretEraseOutcome,
  type McpSecretIdentity,
  type McpSecretStoreService,
  type McpSecretWriteOutcome,
} from "../mcp-connections/secret-store.js";
export {
  MCP_AGENT_CONFIG_SURFACE,
  agentConfigTarget,
  agentConfigTargets,
  mcpConfigSurface,
  mcpServerArtifact,
  mcpServerSourcePath,
  mcpSettingsTarget,
  mcpSourceTarget,
  type AgentMcpConfigOutcome,
} from "../mcp-connections/artifact.js";

// Per-type materialization vocabulary
export {
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  groupInstallTargetsByDirectory,
  skillArtifactFromTargets,
  type InstallableSkillTarget,
  type InstallableSkillTargetLocation,
} from "../skills/skill-artifact.js";
export { computeSkillSourceHash } from "../skills/source-hash.js";
export { ensureSkillAgentArtifact, removeSkillAgentArtifact } from "../skills/materialization.js";

// Canonical package staging, copy, reuse, and on-disk materializability
export {
  copyExtensionDirectory,
  formatCopyExtensionDirectoryFailure,
  type CopyExtensionDirectoryFailureDetails,
  type CopyExtensionDirectoryOptions,
} from "../acquisition/copy-directory.js";
export {
  configuredMcpServersToDiskRefs,
  configuredPacksToDiskRefs,
  configuredSkillsToDiskRefs,
  configuredSubagentsToDiskRefs,
} from "../acquisition/materializable-from-disk.js";
export {
  canonicalMaterializationPaths,
  createCanonicalDirectory,
  materializeExternalPackage,
  materializeExternalPackageWithTreeIntegrity,
  recoverCanonicalDirectory,
  replaceCanonicalDirectory,
  replaceCanonicalDirectoryWithInspection,
  reusableCanonicalTree,
  type CanonicalDirectoryInspection,
  type CanonicalDirectoryReplacementError,
  type CreateCanonicalDirectoryArgs,
  type MaterializeExternalPackageArgs,
  type MaterializedPackage,
  type RecoverCanonicalDirectoryArgs,
  type ReplaceCanonicalDirectoryArgs,
  type ReplaceCanonicalDirectoryWithInspectionArgs,
} from "../acquisition/canonical-directory.js";

// Registry-backed acquisition
export {
  materializeRegistryPackage,
  materializeRegistryPackageWithTreeIntegrity,
  type MaterializeRegistryPackageArgs,
  type RegistryPackageMaterializationMessages,
} from "./registry-materialization.js";
