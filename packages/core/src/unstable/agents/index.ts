/**
 * Agent configuration and detection module for @agentxm/client-core.
 *
 * Provides a registry of known AI coding agents with their skills
 * installation paths, plus effectful detection of installed agents.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Detection (effectful)
export {
  AgentExecutableResolver,
  AgentExecutableResolverLive,
  detectAgent,
  detectAgentInRoot,
  detectAgentScopeResults,
  detectAgentScopes,
  detectAgents,
  detectAgentsForScope,
  detectAgentsInRoot,
  type AgentScopeDetection,
  type AgentExecutableResolverService,
} from "./detection.js";

// Registry (pure data)
export { AGENTS, getAgentIds } from "./registry.js";

// Types and constants
export { AGENT_IDS, CONFIGURABLE_AGENT_IDS } from "./types.js";
export type {
  AgentDescriptor,
  AgentDetectionDescriptor,
  AgentDetectionMarker,
  AgentId,
  AgentInstructionsDescriptor,
  AgentScopeDetectionDescriptor,
  ConfigurableAgentId,
  AgentRegistry,
  AgentSkillsDescriptor,
  AgentSubagentsDescriptor,
} from "./types.js";

export {
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  instructionProjectionIsCurrent,
  instructionProjectionEffects,
  instructionProjectionRemovalEffects,
  observeInstructionProjection,
  probeSymlinkSupport,
  reconcileInstructionTargets,
  resolveInstructionTarget,
  resolveInstructionMechanism,
  resolveInstructionsConfig,
  removeManagedInstructionTargets,
  removeInstructionsGitignore,
  syncInstructions,
  type InstructionProjectionSnapshot,
  type InstructionProjectionEffect,
  type InstructionsGitignoreStatus,
  type InstructionHealth,
  type InstructionMechanism,
  type InstructionsStatus,
  type InstructionsSyncResult,
  type InstructionStatusItem,
  type InstructionTargetOwnership,
  type ObservedInstructionForm,
  type ResolvedInstructionsConfig,
} from "./instructions.js";

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

// Constants (path helpers)
export { getHome, getConfigHome } from "./constants.js";

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
