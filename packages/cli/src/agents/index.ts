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

// Coding-agent services
export {
  CodingAgentRepository,
  type CodingAgent,
  type CodingAgentRepositoryService,
  type ResolveSkillsDirArgs,
  type ResolveSkillsDirOutcome,
} from "./coding-agent.js";
