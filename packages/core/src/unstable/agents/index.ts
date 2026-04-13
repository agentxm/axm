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
export { detectAgent, detectAgentInRoot, detectAgents, detectAgentsInRoot } from "./detection.js";

// Subagent file detection
export { scanAgentSubagentFiles, scanAllSubagentFiles } from "./subagent-detection.js";
export type { DetectedSubagentFile, AgentSubagentSummary } from "./subagent-detection.js";

// Registry (pure data)
export { AGENTS, getAgentById, getAgentIds, getAllAgents } from "./registry.js";

// Types and constants
export { AGENT_IDS } from "./types.js";
export type {
  AgentCommandsDescriptor,
  AgentDescriptor,
  AgentId,
  AgentRegistry,
  AgentSkillsDescriptor,
  AgentSubagentsDescriptor,
} from "./types.js";

// Coding agent service contracts (used by extension managers)
export type {
  AddCommandArgs,
  AddMcpServerArgs,
  AddSubagentArgs,
  CodingAgent,
  CodingAgentRepositoryService,
  CodingAgentRepositoryShape,
  CommandSyncOutcome,
  McpServerSyncFallbackSource,
  McpServerSyncOutcome,
  RemoveCommandArgs,
  RemoveMcpServerArgs,
  RemoveSubagentArgs,
  ResolveCommandsDirArgs,
  ResolveCommandsDirOutcome,
  ResolveSkillsDirArgs,
  ResolveSkillsDirOutcome,
  ResolveSubagentsDirArgs,
  ResolveSubagentsDirOutcome,
  SubagentSyncOutcome,
} from "./coding-agent.js";
export { CodingAgentRepository } from "./coding-agent.js";

// Constants (path helpers)
export { getHome, getConfigHome } from "./constants.js";

// Command sync helpers
export {
  writeCommandFile,
  removeCommandFile,
  addCommandViaResolve,
  removeCommandViaResolve,
  resolveFileExtension,
  type CommandSyncConfig,
} from "./command-sync.js";

// Agent factory
export { makeProjectOnlyCodingAgent, type ProjectOnlyAgentConfig } from "./project-only-agent.js";

// Subagent sync helpers
export {
  writeSubagentFiles,
  removeSubagentFiles,
  addSubagentViaResolve,
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
  runCliInvocation,
  type CliInvocation,
  type CliInvocationResult,
  type MixedStrategyConfig,
  type ConfigFirstStrategy,
} from "./mcp-sync.js";

// Agent service implementations
export { augmentCodingAgent } from "./augment/service.js";
export { claudeCodeCodingAgent, claudeCodeMcpStrategy } from "./claude-code/service.js";
export { codexCodingAgent, codexMcpStrategy } from "./codex/service.js";
export { cursorCodingAgent, cursorMcpStrategy } from "./cursor/service.js";
export { geminiCliCodingAgent, geminiCliMcpStrategy } from "./gemini-cli/service.js";
export { githubCopilotCodingAgent, githubCopilotMcpStrategy } from "./github-copilot/service.js";
export { junieCodingAgent } from "./junie/service.js";
export { kiloCodingAgent } from "./kilo/service.js";
export { kiroCliCodingAgent } from "./kiro-cli/service.js";
export { opencodeCodingAgent, opencodeMcpStrategy } from "./opencode/service.js";
export { rooCodingAgent } from "./roo/service.js";

// Repository implementation
export { DefaultCodingAgentRepository, CodingAgentRepositoryLive } from "./repository.js";
