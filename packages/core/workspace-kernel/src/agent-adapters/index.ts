/**
 * @agentxm/workspace-kernel/agent-adapters public API.
 *
 * Everything AXM knows about a coding agent's native surfaces: detection,
 * path primitives, the per-agent `CodingAgent` adapter, subagent rendering,
 * MCP entry projection and config writing, hook-group editing, the ownership
 * marker grammar, and the YAML/TOML/JSON codec wrappers those writers use.
 *
 * Every input crosses as plain data. Native writes go through the
 * `NativeWriteAuthority` port so the workspace core keeps protection and
 * durable-change accounting. Environment-backed layers live behind `./live`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Detection (effectful)
export { invalidNativeConfig, parseNativeConfigRoot } from "./native-config-syntax.js";
export { preflightNativeConfigReaders } from "./native-config-readers.js";
export {
  AgentExecutableResolver,
  AgentDetectionRoots,
  detectAgentScopeResults,
  detectAgentsForScope,
  type AgentScopeDetection,
} from "./detection.js";
export {
  AgentPresenceProbe,
  AgentPresenceUnavailable,
  type AgentPresenceProbeService,
} from "./agent-presence.js";

// Failure vocabulary
export {
  AgentDetectionFailed,
  HookConfigInvalid,
  HookIoFailed,
  McpConfigInvalid,
  McpConfigIoFailed,
  McpDefinitionInvalid,
  McpSharedTargetConflict,
  SubagentIoFailed,
  WriteBackupRetained,
  type CodingAgentFailure,
  type NativeFormatFailure,
} from "./errors.js";

// Native-write port
export {
  NativeWriteAuthority,
  NativeWriteRefused,
  type NativeWriteAuthorityService,
  type NativeInsertionCapture,
  type NativeInsertionTarget,
} from "./native-write-authority.js";

// Constants (path helpers)
// Scope wording
export { userScopeRefusal } from "./scope-refusal.js";

// Coding-agent adapters
export {
  type AddSubagentArgs,
  type CodingAgent,
  type McpServerSyncOutcome,
  type McpServerSyncTarget,
  type RemoveSubagentArgs,
  type SubagentWriteDecision,
} from "./agents/coding-agent.js";
export { codingAgentForId, codingAgentFromDescriptor } from "./agents/adapters.js";

// Region fence grammar and pure managed-region edits
export {
  fenceSyntaxForTarget,
  isRegionName,
  REGION_NAMES,
  scanFences,
  scanUnknownFences,
  type FenceLine,
  type RegionName,
} from "./region-fences.js";
export {
  inspectManagedRegion,
  renderManagedRegion,
  verifyRenderedRegion,
  type ManagedRegionProblem,
  type ManagedRegionState,
} from "./managed-regions.js";
export { reconcilePatternList } from "./managed-regions-pattern-list.js";

// Subagent rendering and native publication
export { renderSubagent } from "./subagents/rendering/index.js";
export {
  type SubagentRenderInput,
  type SubagentRenderOutput,
} from "./subagents/rendering/types.js";
export { removeSubagentFiles } from "./subagents/sync.js";

// MCP native format
export {
  projectExpectedEntry,
  renderEnvValue,
  normalizeNativeMcpEnvValue,
  type ExpectedAgentEntry,
  type McpServerDeclaration,
} from "./mcps/expected-entry.js";
export { resolveMcpInvocation } from "./mcps/resolution.js";
export {
  removeAgentMcpConfig,
  retireAgentMcpConfig,
  validateAgentMcpConfigWrite,
  writeAgentMcpConfig,
  type AgentMcpConfigEntryRef,
} from "./mcps/config-writer.js";
export {
  decodeJsonMcpConfig,
  readNativeMcpConfig,
  readNativeMcpEntry,
  readNativeMcpServers,
  readNativeMcpValues,
  resolveAgentMcpConfigTargetPath,
} from "./mcps/native-config.js";
export { manifestInputs, mcpInputVariables, mcpInputId, resolveMcpInputs } from "./mcps/inputs.js";
export { decodeMcpServerManifestAt, readMcpServerManifestAt } from "./mcps/manifest.js";
export {
  planMcpServerTargets,
  unresolvedMcpAgentTargets,
  type McpAgentTargetPlan,
} from "./mcps/target-plan.js";
export { resolveSharedMcpTarget } from "./mcps/shared-target.js";
export {
  configuredMcpCapability,
  declaredMcpWriterTargets,
  resolveConfiguredMcpTargets,
  isConfigurableAgentId,
  type McpTargetGroup,
} from "./mcps/targeting.js";
export {
  removeMcpServerFromAgents,
  syncInlineMcpServerToAgents,
  syncManifestMcpServerToAgents,
  syncPluginMcpServerToAgents,
  validatePluginMcpServerTargets,
  validateManifestMcpServerTargets,
  validateInlineMcpServerTargets,
  type SyncInlineMcpServerArgs,
} from "./mcps/sync.js";

// Hook-group editing
export { reconcileNativeHookConfig } from "./hooks/native-config.js";
export {
  isDeclaredHookEntry,
  readDeclaredHookUnits,
  readDeclaredHookGroups,
  updateHooksJson,
  type HookNativeDeclaration,
} from "./hooks/managed-groups.js";

// Codec wrappers used by the native writers
export { readYamlEntry } from "./yaml.js";

// Transient backup for native rewrites
export { TransientBackupFailed } from "./transient-backup.js";

export {
  McpValueSchema,
  McpConnectionSchema,
  McpAuthSchema,
  McpDistributionSchema,
  McpBindingSchema,
  normalizeMcpValue,
  isMcpCredentialName,
  validateMcpConnection,
  type McpValue,
  type McpConnection,
  type McpAuth,
  type McpDistribution,
  type McpBinding,
} from "./mcps/connection.js";

export {
  mcpDistributionId,
  mcpDistributionCandidates,
  mcpDistributionDestination,
  selectMcpDistribution,
  mcpRunner,
} from "./mcps/distribution.js";
export { readPluginMcpDefinition } from "./mcps/plugin-definition.js";
export { renderNativeHookGroup } from "./hooks/native-entry.js";
