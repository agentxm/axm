/**
 * Disable MCP server executor.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { NativeWriteAuthority } from "../../../projection/agent-adapters/index.js";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { CodingAgentRepository } from "../../../projection/index.js";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import type { StepFailure } from "../../../transitions/planning/index.js";
import { appendWarningsToMessage } from "../../../transitions/planning/index.js";
import type {
  JobStepArtifactTarget,
  JobStepResult,
  Operation,
} from "../../../transitions/planning/index.js";
import { SettingsReader, SettingsWriter, WorkspaceLocation } from "../../../desired-state/index.js";
import {
  WorkspaceTransactionScope,
  runWorkspaceTransaction,
} from "../../../transitions/settlement/index.js";
import {
  agentConfigTargets,
  mcpServerArtifact,
  mcpSettingsTarget,
} from "../../../materialization/index.js";
import { mcpSyncWarnings, requireSuccessfulMcpSync } from "./sync-outcome.js";
import {
  StepFailureConversion,
  withAdaptedStepFailures,
} from "../../../lifecycle/step-failure-conversion.js";
import { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";

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
  | WorkspaceLocation
  | SettingsReader
  | SettingsWriter
  | WorkspaceTransactionScope
  | CodingAgentRepository
  | NativeWriteAuthority
  | StepFailureConversion
> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const settingsWriter = yield* SettingsWriter;
    const agentRepo = yield* CodingAgentRepository;

    const configured = yield* settings.entries("mcp-server");
    const entry = configured[op.args.serverName];
    if (entry === undefined) {
      return yield* new ExtensionLifecycleFailed({
        category: "not_found",
        detail: `MCP server "${op.args.serverName}" not found in settings`,
      });
    }

    const agents = yield* agentRepo.getConfiguredAgents();
    const outcomes = yield* runWorkspaceTransaction({
      transition: Effect.gen(function* () {
        const synced = yield* Effect.forEach(
          agents,
          (agent) =>
            agent.removeMcpServer({
              workspaceRoot: location.baseDir,
              scope: location.scope,
              serverName: op.args.serverName,
              disableOnly: false,
            }),
          { concurrency: 1 },
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
        yield* settingsWriter.updateEntry("mcp-server", op.args.serverName, (current) => ({
          ...current,
          enabled: false,
        }));
        return synced;
      }),
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
        scope: location.scope,
        change: "updated",
        targets: [
          mcpSettingsTarget(location.scope, "updated"),
          ...agentConfigTargets(syncedAgents),
        ],
      }),
    };
  }).pipe(withAdaptedStepFailures);
