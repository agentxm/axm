/**
 * Agent configuration and detection module for @axm.sh/core.
 *
 * Provides a registry of known AI coding agents with their skills
 * installation paths, plus effectful detection of installed agents.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Detection (effectful)
export { detectAgent, detectAgents } from "./detection.js";

// Registry (pure data)
export { AGENTS, getAgentById, getAgentIds, getAllAgents } from "./registry.js";

// Types and constants
export { AGENT_IDS } from "./types.js";
export type { AgentDescriptor, AgentId, AgentRegistry, AgentSkillsDescriptor } from "./types.js";

// Coding agent service contracts (used by extension managers)
export type {
  AddMcpServerArgs,
  CodingAgent,
  CodingAgentRepositoryService,
  CodingAgentRepositoryShape,
  McpServerSyncFallbackSource,
  McpServerSyncOutcome,
  RemoveMcpServerArgs,
  ResolveSkillsDirArgs,
  ResolveSkillsDirOutcome,
} from "./coding-agent.js";
export { CodingAgentRepository } from "./coding-agent.js";

// Constants (path helpers)
export { getHome, getConfigHome } from "./constants.js";

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
export { claudeCodeCodingAgent, claudeCodeMcpStrategy } from "./claude-code/service.js";
export { codexCodingAgent, codexMcpStrategy } from "./codex/service.js";
export { cursorCodingAgent, cursorMcpStrategy } from "./cursor/service.js";
export { geminiCliCodingAgent, geminiCliMcpStrategy } from "./gemini-cli/service.js";
export { githubCopilotCodingAgent, githubCopilotMcpStrategy } from "./github-copilot/service.js";
export { opencodeCodingAgent, opencodeMcpStrategy } from "./opencode/service.js";

// Repository implementation
export { DefaultCodingAgentRepository, CodingAgentRepositoryLive } from "./repository.js";
