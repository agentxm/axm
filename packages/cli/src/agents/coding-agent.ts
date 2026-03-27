/**
 * Coding agent service contracts for skills installation.
 *
 * Re-exports the CodingAgentRepository service tag and types from core.
 * The concrete implementation (DefaultCodingAgentRepository) lives in repository.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

// Re-export core types so existing CLI consumers don't need to change imports
export type {
  AddMcpServerArgs,
  CodingAgent,
  CodingAgentRepositoryService,
  McpServerSyncFallbackSource,
  McpServerSyncOutcome,
  RemoveMcpServerArgs,
  ResolveSkillsDirArgs,
  ResolveSkillsDirOutcome,
} from "@axm.sh/core/unstable/agents";

export { CodingAgentRepository } from "@axm.sh/core/unstable/agents";
