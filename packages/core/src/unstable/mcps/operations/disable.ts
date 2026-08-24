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
import { makeAppError, type AppError } from "../../app-error/index.js";
import { appendWarningsToMessage } from "../../plan/job-step-message.js";
import type { JobStepArtifactTarget, JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { surfaceRestorationIncomplete } from "../../workspace/transaction.js";
import { agentConfigTargets, mcpServerArtifact, mcpSettingsTarget } from "./artifact.js";
import { mcpSyncWarnings, requireSuccessfulMcpSync } from "./sync-outcome.js";
import { inspectAgentMcpServer } from "../inspection.js";
import { isMcpServerApplicableToAgent, sharedMcpTargetPolicyConflict } from "../targeting.js";

export type DisableMcpServerOperation = Operation<
  "disable-mcp-server",
  { readonly serverName: string }
>;

export const disableMcpServer = (
  op: DisableMcpServerOperation,
): Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
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
    const sharedTargetConflict = sharedMcpTargetPolicyConflict({
      entry,
      agentIds: agents.map((agent) => agent.id),
      scope: ws.scope,
    });
    if (sharedTargetConflict !== undefined) {
      return yield* makeAppError({ code: "conflict", detail: sharedTargetConflict });
    }
    const outcomes = yield* ws
      .runTransaction({
        transition: Effect.gen(function* () {
          const synced = yield* Effect.forEach(
            agents,
            (agent) =>
              Effect.gen(function* () {
                if (isMcpServerApplicableToAgent(entry, agent.id)) {
                  return yield* agent.removeMcpServer({
                    workspaceRoot: ws.baseDir,
                    scope: ws.scope,
                    serverName: op.args.serverName,
                    disableOnly: true,
                  });
                }
                const inspection = yield* inspectAgentMcpServer({
                  workspaceRoot: ws.baseDir,
                  scope: ws.scope,
                  agentId: agent.id,
                  serverName: op.args.serverName,
                  entry,
                });
                if (inspection.status === "unmanaged") {
                  return yield* makeAppError({
                    code: "conflict",
                    detail: `${agent.id} has an unmanaged MCP server named ${op.args.serverName}; AXM will not remove it while applying the target policy`,
                  });
                }
                return inspection.status === "drift"
                  ? yield* agent.removeMcpServer({
                      workspaceRoot: ws.baseDir,
                      scope: ws.scope,
                      serverName: op.args.serverName,
                    })
                  : ({ _tag: "success", targets: [] } as const);
              }),
            { concurrency: "unbounded" },
          );
          yield* requireSuccessfulMcpSync(
            op.args.serverName,
            agents.map((agent, index) => ({
              agentId: agent.id,
              outcome: synced[index] ?? {
                _tag: "failed" as const,
                reason: "Agent sync returned no outcome",
              },
            })),
          );
          yield* ws.updateMcpServerEntry(op.args.serverName, (current) => ({
            ...current,
            enabled: false,
          }));
          return synced;
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
        validate: () => Effect.void,
      })
      .pipe(surfaceRestorationIncomplete);
    const syncedAgents: ReadonlyArray<{
      readonly agentId: AgentId;
      readonly targets?: ReadonlyArray<JobStepArtifactTarget>;
    }> = agents.flatMap((agent, index) => {
      const outcome = outcomes[index];
      return outcome !== undefined && "targets" in outcome
        ? [{ agentId: agent.id, targets: outcome.targets }]
        : [];
    });
    const warnings = mcpSyncWarnings(
      op.args.serverName,
      agents.map((agent, index) => ({
        agentId: agent.id,
        outcome: outcomes[index] ?? {
          _tag: "failed" as const,
          reason: "Agent sync returned no outcome",
        },
      })),
    );

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
