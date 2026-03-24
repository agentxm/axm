// Re-export data layer from core
export * from "@axm.sh/core/unstable/agents";

// Keep CLI-specific service exports
export {
  CodingAgentRepository,
  type CodingAgent,
  type CodingAgentRepositoryService,
  type ResolveSkillsDirArgs,
  type ResolveSkillsDirOutcome,
} from "./coding-agent.js";
