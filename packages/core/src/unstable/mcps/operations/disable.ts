/**
 * Disable MCP server executor.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { CodingAgentRepository } from "../../agents/index.js";
import type { AgentId } from "../../agents/index.js";
import type { McpServerSyncOutcome } from "../../agents/coding-agent.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import { appendWarningsToMessage } from "../../plan/job-step-message.js";
import type { JobStepArtifactTarget, JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { agentConfigTargets, mcpServerArtifact, mcpSettingsTarget } from "./artifact.js";

export type DisableMcpServerOperation = Operation<
  "disable-mcp-server",
  { readonly serverName: string }
>;

const formatAgentSyncWarnings = (
  serverName: string,
  outcomes: ReadonlyArray<McpServerSyncOutcome>,
): ReadonlyArray<string> => {
  const warnings = outcomes.filter((outcome) => outcome._tag !== "success");
  if (warnings.length === 0) return [];

  return [
    `MCP agent sync warnings for ${serverName}: ${warnings
      .map((outcome) =>
        outcome._tag === "fallback"
          ? `fallback(${outcome.fallbackFrom}):${outcome.reason}`
          : outcome.reason,
      )
      .join(", ")}`,
  ];
};

export const disableMcpServer = (
  op: DisableMcpServerOperation,
): Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;

    const configured = yield* ws.getConfiguredMcpServerEntries();
    const entry = configured[op.args.serverName];
    if (entry === undefined) {
      return yield* makeAppError({
        code: "not_found",
        detail: `MCP server "${op.args.serverName}" not found in settings`,
      });
    }

    const agents = yield* agentRepo.getConfiguredAgents();
    const outcomes = yield* Effect.forEach(
      agents,
      (agent) =>
        agent.removeMcpServer({
          workspaceRoot: ws.baseDir,
          scope: ws.scope,
          serverName: op.args.serverName,
          disableOnly: true,
        }),
      { concurrency: "unbounded" },
    );
    const syncedAgents: ReadonlyArray<{
      readonly agentId: AgentId;
      readonly targets?: ReadonlyArray<JobStepArtifactTarget>;
    }> = agents.flatMap((agent, index) => {
      const outcome = outcomes[index];
      return outcome !== undefined && "targets" in outcome
        ? [{ agentId: agent.id, targets: outcome.targets }]
        : [];
    });
    const warnings = formatAgentSyncWarnings(op.args.serverName, outcomes);

    yield* ws.updateMcpServerEntry(op.args.serverName, (current) => ({
      ...current,
      enabled: false,
    }));

    return {
      result: "success",
      message: appendWarningsToMessage(`Disabled ${op.args.serverName}`, warnings),
      artifact: mcpServerArtifact({
        lockEntry: undefined,
        scope: ws.scope,
        change: "updated",
        targets: [mcpSettingsTarget("updated"), ...agentConfigTargets(syncedAgents)],
      }),
    };
  });
