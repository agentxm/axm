export { McpServerManager, McpServerManagerLive } from "./manager.js";

export type {
  InstallMcpServerOperationArgs,
  InstallMcpServerOperation,
} from "./operations/install.js";
export { installMcpServer } from "./operations/install.js";
export type {
  UninstallMcpServerOperationArgs,
  UninstallMcpServerOperation,
} from "./operations/uninstall.js";
export { uninstallMcpServer } from "./operations/uninstall.js";
export type { EnableMcpServerOperation } from "./operations/enable.js";
export { enableMcpServer } from "./operations/enable.js";
export type { DisableMcpServerOperation } from "./operations/disable.js";
export { disableMcpServer } from "./operations/disable.js";
export { mcpServerArtifact, mcpSettingsTarget, mcpSourceTarget } from "./operations/artifact.js";
export { resolveMcpServer, type McpResolution } from "./resolution.js";
export { writeAgentMcpConfig, removeAgentMcpConfig } from "./config-writer.js";
export { buildAxmMcpMetadata, buildAxmMcpMetadataFromSettingsSource } from "./metadata.js";
export {
  collectManagedAgentMcpServers,
  inspectAgentMcpServer,
  inspectMcpServerAcrossAgents,
  type AgentMcpInspectionStatus,
  type AgentMcpServerInspection,
  type CollectManagedAgentMcpServersArgs,
  type InspectAgentMcpServerArgs,
  type ManagedAgentMcpServer,
} from "./inspection.js";
export {
  diffAgentEntry,
  inferInlineRemoteTransport,
  type InlineRemoteTransportInference,
  projectExpectedEntry,
  renderEnvValue,
  type DriftReport,
  type ExpectedAgentEntry,
  type InlineRemoteTransport,
  type ProjectExpectedEntryArgs,
} from "./projection.js";
export {
  resolveSharedMcpTarget,
  type ResolvedSharedMcpTarget,
  type SharedMcpTargetConflict,
  type SharedMcpTargetMember,
  type SharedMcpTargetResolution,
  type SharedMcpTransport,
} from "./shared-target.js";
export {
  groupConfiguredMcpTargets,
  MCP_NOT_APPLICABLE_REASON,
  planMcpTargetGroups,
  sharedMcpTargetPolicyConflict,
  type McpTargetGroup,
} from "./targeting.js";

export {
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpEntryUnmanaged,
  McpInstallStateMissing,
  McpOwnershipMarkerInvalid,
  McpRegistryOnlyInstall,
  McpSharedTargetConflict,
  type McpManagerError,
} from "./errors.js";
