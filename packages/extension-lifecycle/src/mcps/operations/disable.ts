/**
 * Disable MCP server executor.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { CodingAgentRepository } from "@agentxm/extension-workspace";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import type { StepFailure } from "@agentxm/workspace-operations";
import { appendWarningsToMessage } from "@agentxm/workspace-operations";
import type {
  JobStepArtifactTarget,
  JobStepResult,
  Operation,
} from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { agentConfigTargets, mcpServerArtifact, mcpSettingsTarget } from "./artifact.js";
import { mcpSyncWarnings, requireSuccessfulMcpSync } from "./sync-outcome.js";
import { LifecycleFailureAdapter, withAdaptedStepFailures } from "../../failure-adapter.js";
import { ExtensionLifecycleFailed } from "../../errors.js";

export type DisableMcpServerOperation = Operation<
  "disable-mcp-server",
  { readonly serverName: string }
>;

export const disableMcpServer = (
  op: DisableMcpServerOperation,
): Effect.Effect<
  JobStepResult,
  StepFailure,
  | FileSystem.FileSystem
  | Path.Path
  | WorkspaceMutations
  | CodingAgentRepository
  | LifecycleFailureAdapter
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const agentRepo = yield* CodingAgentRepository;

    const configured = yield* ws.getConfiguredMcpServerEntries();
    const entry = configured[op.args.serverName];
    if (entry === undefined) {
      return yield* new ExtensionLifecycleFailed({
        category: "not_found",
        detail: `MCP server "${op.args.serverName}" not found in settings`,
      });
    }

    const agents = yield* agentRepo.getConfiguredAgents();
    const outcomes = yield* ws.runTransaction({
      transition: Effect.gen(function* () {
        const synced = yield* Effect.forEach(
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
    });
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
      result: "success" as const,
      message: appendWarningsToMessage(`Disabled ${op.args.serverName}`, warnings),
      artifact: mcpServerArtifact({
        lockEntry: undefined,
        scope: ws.scope,
        change: "updated",
        targets: [mcpSettingsTarget(ws.scope, "updated"), ...agentConfigTargets(syncedAgents)],
      }),
    };
  }).pipe(withAdaptedStepFailures);
