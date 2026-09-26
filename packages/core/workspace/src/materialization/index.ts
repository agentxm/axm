/**
 * @agentxm/workspace/materialization public API.
 *
 * The materialization capability: the per-extension-type manager contract and
 * service tags each extension kind implements, the kernel failure families and
 * the brand every kind failure carries, the materialization capabilities a
 * workspace transition drives, the MCP credential port, and registry-backed
 * acquisition. The kinds'
 * manager layers live behind `./kinds-live`; the projection participants
 * layer lives behind `./live`; deterministic doubles live behind `./testing`.
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

// The materialization capabilities a workspace transition drives
export type {
  AuthorMaterialization,
  InstallMaterialization,
  MaterializationConfiguration,
  MaterializationProjection,
  SynchronizeMaterialization,
  UninstallMaterialization,
} from "./ports/transition-materialization.js";

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
  type InstallMcpServerOperation,
  type InstallMcpServerOperationArgs,
  type McpConnectionInstallRequirements,
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
  ExtensionKindFailureTypeId,
  failureTag,
  isExtensionKindFailure,
  type ExtensionKindFailure,
} from "./kind-failure.js";
export {
  acceptedResolutionFor,
  InstallStateMissing,
  type AcceptedResolution,
  type AcquiredContentIdentity,
} from "./accepted-resolution.js";

// The credential port MCP connection installs persist secrets through.
export {
  MCP_SECRET_SERVICE,
  McpSecretStore,
  mcpSecretAccount,
  type McpSecretEraseOutcome,
  type McpSecretIdentity,
  type McpSecretStoreService,
  type McpSecretWriteOutcome,
} from "./ports/mcp-secret-store.js";

// The artifact a skill materialization reports across its agent targets
export {
  artifactAgentIdsFromTargets,
  artifactTargetAgentIds,
  groupInstallTargetsByDirectory,
  skillArtifactFromTargets,
  type InstallableSkillTarget,
  type InstallableSkillTargetLocation,
} from "./skill-artifact.js";

// Registry-backed acquisition
export {
  materializeRegistryPackage,
  materializeRegistryPackageWithTreeIntegrity,
  type MaterializeRegistryPackageArgs,
  type RegistryPackageMaterializationMessages,
} from "./registry-materialization.js";
