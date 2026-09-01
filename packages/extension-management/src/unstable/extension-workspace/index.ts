/**
 * Extension-workspace public surface: the per-extension-type lifecycle
 * manager contract, the coding-agent projection port and its default
 * repository, the per-type agent-surface sync helpers, and the layer's
 * failure vocabulary.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export type { ExtensionManager, MaterializationObservation } from "./extension-manager.js";
export {
  WriteBackupRetained,
  type ExtensionManagerFailure,
  type ExtensionWorkspaceError,
} from "./errors.js";

// Managed-file discovery (read-only scanning of agent surfaces)
export {
  extensionNameFromFilename,
  findManagedSubagentFiles,
  hasAxmManagedMarker,
  safeReadDirectory,
  safeReadFileString,
  type WorkspaceOwnershipIssue,
} from "./managed-file-discovery.js";

// Coding agent service contracts (used by extension managers)
export type {
  AddMcpServerArgs,
  AddSubagentArgs,
  CodingAgent,
  CodingAgentRepositoryService,
  CodingAgentRepositoryShape,
  McpServerSyncFallbackSource,
  McpServerSyncOutcome,
  McpServerSyncTarget,
  RemoveMcpServerArgs,
  RemoveSubagentArgs,
  ResolveSkillsDirArgs,
  ResolveSkillsDirOutcome,
  ResolveSubagentsDirArgs,
  ResolveSubagentsDirOutcome,
  SubagentSyncOutcome,
} from "./coding-agent.js";
export { CodingAgentRepository } from "./coding-agent.js";

// Subagent sync helpers
export {
  writeSubagentFiles,
  renderManagedSubagentOutputs,
  removeSubagentFiles,
  addSubagentViaResolve,
  dirOutcomeToSubagentSyncOutcome,
  removeSubagentViaResolve,
  addRooSubagent,
  removeRooSubagent,
} from "./subagent-sync.js";

// MCP sync helpers
export {
  addMcpServerMixed,
  addMcpServerConfigOnly,
  addMcpServerConfigFirst,
  removeMcpServerMixed,
  removeMcpServerConfigOnly,
  removeMcpServerConfigFirst,
  removeMcpServerFromManifest,
  pruneManagedMcpServersForAgent,
  runCliInvocation,
  syncInlineMcpServerToAgent,
  syncInlineMcpServerToAgents,
  type CliInvocation,
  type CliInvocationResult,
  type MixedStrategyConfig,
  type ConfigFirstStrategy,
  type PruneManagedMcpServersArgs,
  type SyncInlineMcpServerArgs,
} from "./mcp-sync.js";

// Repository implementation
export {
  codingAgentForId,
  DefaultCodingAgentRepository,
  CodingAgentRepositoryLive,
} from "./repository.js";
