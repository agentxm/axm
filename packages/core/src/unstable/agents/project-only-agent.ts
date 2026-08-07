/**
 * Factory for project-only coding agent implementations.
 *
 * Most agents share the same structure: project-scoped skills directory,
 * optional project-scoped subagents directory, no user scope, and optionally
 * MCP support via a strategy object.
 * This factory eliminates the boilerplate.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import type {
  CodingAgent,
  AddMcpServerArgs,
  RemoveMcpServerArgs,
  McpServerSyncOutcome,
} from "./coding-agent.js";
import { addSubagentViaResolve, removeSubagentViaResolve } from "./subagent-sync.js";
import { userScopeRefusal } from "./scope-refusal.js";
import type { AgentId } from "./types.js";
import type * as FileSystem from "effect/FileSystem";
import type { AppError } from "../app-error/index.js";

/**
 * MCP handler pair for agents that support MCP server management.
 */
interface McpHandlers {
  readonly addMcpServer: (
    args: AddMcpServerArgs,
  ) => Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path>;
  readonly removeMcpServer: (
    args: RemoveMcpServerArgs,
  ) => Effect.Effect<McpServerSyncOutcome, AppError, FileSystem.FileSystem | Path.Path>;
}

/**
 * Configuration for creating a project-only coding agent.
 */
export interface ProjectOnlyAgentConfig {
  /** The agent's unique identifier. */
  readonly agentId: AgentId;
  /** Display name for error messages (e.g. "Junie", "Cursor"). */
  readonly displayName: string;
  /** Skills directory relative to workspace root (e.g. ".junie/skills"). */
  readonly skillsProjectDir: string;
  /** Subagents directory relative to workspace root (e.g. ".junie/agents"). */
  readonly subagentsProjectDir?: string;
  /** Optional MCP handlers. When omitted, MCP operations return "unsupported". */
  readonly mcp?: McpHandlers;
}

/**
 * Create a CodingAgent for an agent that only supports project-scoped
 * skills and subagents. The returned agent rejects user-scope
 * operations, reports omitted capabilities as unsupported, and unless MCP
 * handlers are provided, reports MCP as unsupported.
 */
export const makeProjectOnlyCodingAgent = (config: ProjectOnlyAgentConfig): CodingAgent => {
  const { mcp } = config;

  const agent: CodingAgent = {
    id: config.agentId,
    resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        return {
          _tag: "supported",
          dir: path.resolve(workspaceRoot, config.skillsProjectDir),
        } as const;
      }),
    addMcpServer: mcp
      ? (args) => mcp.addMcpServer(args)
      : () =>
          Effect.succeed({
            _tag: "unsupported",
            reason: `MCP add is not supported for ${config.agentId}`,
          } as const),
    removeMcpServer: mcp
      ? (args) => mcp.removeMcpServer(args)
      : () =>
          Effect.succeed({
            _tag: "unsupported",
            reason: `MCP remove is not supported for ${config.agentId}`,
          } as const),
    resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        if (config.subagentsProjectDir === undefined) {
          return {
            _tag: "unsupported",
            reason: `${config.displayName} does not support custom subagents`,
          } as const;
        }
        if (scope === "user") {
          return {
            _tag: "unsupported",
            reason: userScopeRefusal({
              agentId: config.agentId,
              agentName: config.displayName,
              type: "subagents",
            }),
          } as const;
        }
        return {
          _tag: "supported",
          dir: path.resolve(workspaceRoot, config.subagentsProjectDir),
          warnings: [],
        } as const;
      }),
    addSubagent: (args) => addSubagentViaResolve(agent.resolveEffectiveSubagentsDir(args), args),
    removeSubagent: (args) =>
      removeSubagentViaResolve(agent.resolveEffectiveSubagentsDir(args), args),
  };

  return agent;
};
