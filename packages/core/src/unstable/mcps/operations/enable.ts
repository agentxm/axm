/**
 * Enable MCP server executor.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CodingAgentRepository, syncInlineMcpServerToAgents } from "../../agents/index.js";
import { normalizeHandle, parseExtensionFqnParts } from "../../extensions/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import { appendWarningsToMessage } from "../../plan/job-step-message.js";
import type { JobStepArtifactTarget, JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { surfaceRestorationIncomplete } from "../../workspace/transaction.js";
import type { McpServerLockEntry } from "../../lockfile/index.js";
import { agentConfigTargets, mcpServerArtifact, mcpSettingsTarget } from "./artifact.js";
import { usableAcceptedCanonicalObservation } from "../../workspace/accepted-canonical-ref.js";
import { mcpSyncWarnings, requireSuccessfulMcpSync } from "./sync-outcome.js";
import {
  applyProjectionPlansWithResults,
  planSingletonProjection,
} from "../../projection/planning.js";
import { inspectAgentMcpServer } from "../inspection.js";
import { isMcpServerApplicableToAgent, sharedMcpTargetPolicyConflict } from "../targeting.js";

export type EnableMcpServerOperation = Operation<
  "enable-mcp-server",
  { readonly serverName: string }
>;

const enableArtifact = (args: {
  readonly lockEntry: McpServerLockEntry | undefined;
  readonly scope: "project" | "user";
  readonly targets: ReadonlyArray<JobStepArtifactTarget>;
}) => {
  return mcpServerArtifact({
    lockEntry: args.lockEntry,
    scope: args.scope,
    change: "updated",
    targets: [mcpSettingsTarget(args.scope, "updated"), ...args.targets],
  });
};

export const enableMcpServer = (
  op: EnableMcpServerOperation,
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

    if (entry.source === "inline") {
      const agentIds = yield* ws.getConfiguredAgents();
      const outcomes = yield* ws
        .runTransaction({
          transition: Effect.gen(function* () {
            const synced = yield* syncInlineMcpServerToAgents(agentIds, {
              workspaceRoot: ws.baseDir,
              serverName: op.args.serverName,
              entry: { ...entry, enabled: true },
              scope: ws.scope,
            }).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            );
            const agentOutcomes = agentIds.map((agentId, index) => ({
              agentId,
              outcome: synced[index] ?? {
                _tag: "failed" as const,
                reason: "Agent sync returned no outcome",
              },
            }));
            yield* requireSuccessfulMcpSync(op.args.serverName, agentOutcomes);
            yield* ws.updateMcpServerEntry(op.args.serverName, (current) => ({
              ...current,
              enabled: true,
            }));
            return synced;
          }),
          validate: () => Effect.void,
        })
        .pipe(surfaceRestorationIncomplete);
      const identifiedOutcomes = agentIds.map((agentId, index) => ({
        agentId,
        outcome: outcomes[index] ?? {
          _tag: "failed" as const,
          reason: "Agent sync returned no outcome",
        },
      }));
      const warnings = mcpSyncWarnings(op.args.serverName, identifiedOutcomes);
      const agentOutcomes = agentIds.flatMap((agentId, index) => {
        const outcome = outcomes[index];
        return outcome !== undefined && "targets" in outcome
          ? [{ agentId, targets: outcome.targets }]
          : [];
      });
      return {
        result: "success",
        message: appendWarningsToMessage(`Enabled ${op.args.serverName}`, warnings),
        artifact: enableArtifact({
          lockEntry: undefined,
          scope: ws.scope,
          targets: agentConfigTargets(agentOutcomes),
        }),
      };
    }

    const canonical = yield* usableAcceptedCanonicalObservation({
      workspace: ws,
      type: "mcp-server",
      name: op.args.serverName,
    });
    if (Option.isNone(canonical)) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Accepted MCP server content for "${op.args.serverName}" is not usable`,
        suggestions: [
          {
            description: "Try reinstalling the MCP server.",
            cmd: "axm mcps install <source>",
          },
        ],
      });
    }
    const canonicalPath = canonical.value.observation.path;
    const accepted =
      canonical.value.accepted?.extensionType === "mcp-server"
        ? canonical.value.accepted
        : undefined;
    const identity = canonical.value.desired.identity.startsWith("workspace:")
      ? canonical.value.desired.identity.slice("workspace:".length)
      : canonical.value.desired.identity;
    const trustedIdentity = parseExtensionFqnParts(identity);
    const owner =
      trustedIdentity?.type === "mcp-server" ? trustedIdentity.owner : normalizeHandle("@local");
    const resolvedVersion = accepted?.type === "registry" ? accepted.resolvedVersion : "0.0.0";

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
          const synced = yield* applyProjectionPlansWithResults(
            agents.map((agent) =>
              planSingletonProjection({
                unitId: "mcp-server:native-config-entry",
                targetFile: "mcp:configured-agents",
                contributor: op.args,
                adapter: {
                  observe: () =>
                    Effect.succeed({
                      unitId: "mcp-server:native-config-entry",
                      path: `${agent.id}:${op.args.serverName}`,
                      present: false,
                      current: false,
                      expectedContributors: [op.args.serverName],
                      observedContributors: [],
                    }),
                  apply: () =>
                    Effect.gen(function* () {
                      if (!isMcpServerApplicableToAgent(entry, agent.id)) {
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
                      }
                      return yield* agent.addMcpServer({
                        workspaceRoot: ws.baseDir,
                        scope: ws.scope,
                        serverName: op.args.serverName,
                        canonicalPath,
                        owner,
                        resolvedVersion,
                        enabled: true,
                        configValues: entry.env,
                      });
                    }).pipe(
                      Effect.provideService(FileSystem.FileSystem, fs),
                      Effect.provideService(Path.Path, path),
                    ),
                },
              }),
            ),
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
            enabled: true,
          }));
          return synced;
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
        validate: () => Effect.void,
      })
      .pipe(surfaceRestorationIncomplete);
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
    const agentOutcomes = agents.flatMap((agent, index) => {
      const outcome = outcomes[index];
      return outcome !== undefined && "targets" in outcome
        ? [{ agentId: agent.id, targets: outcome.targets }]
        : [];
    });
    return {
      result: "success",
      message: appendWarningsToMessage(`Enabled ${op.args.serverName}`, warnings),
      artifact: enableArtifact({
        lockEntry: accepted,
        scope: ws.scope,
        targets: agentConfigTargets(agentOutcomes),
      }),
    };
  });
