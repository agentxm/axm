/**
 * Agent configuration and detection module for @agentxm/core.
 *
 * Provides a registry of known AI coding agents with their skills
 * installation paths, plus effectful detection of installed agents.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Detection (effectful)
export { DetectionError, detectAgent, detectAgents } from "./detection.js";

// Registry (pure data)
export { AGENTS, getAgentById, getAgentIds, getAllAgents } from "./registry.js";
// Types
export type {
  AgentConfig,
  AgentId,
  AgentRegistry,
  AgentSkillsConfig,
} from "./types.js";
