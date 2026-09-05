/**
 * Enable MCP server executor.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  CodingAgentRepository,
  syncInlineMcpServerToAgents,
  applyProjectionPlansWithResults,
  planSingletonProjection,
} from "@agentxm/extension-workspace";
import {
  normalizeHandle,
  parseExtensionFqnParts,
} from "@agentxm/extension-model/unstable/extensions";
import type { StepFailure } from "@agentxm/workspace-operations";
import { appendWarningsToMessage } from "@agentxm/workspace-operations";
import type {
  JobStepArtifactTarget,
  JobStepResult,
  Operation,
} from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import type { McpServerLockEntry } from "@agentxm/workspace-state";
import { agentConfigTargets, mcpServerArtifact, mcpSettingsTarget } from "./artifact.js";
import { usableAcceptedCanonicalObservation } from "@agentxm/workspace-state";
import { mcpSyncWarnings, requireSuccessfulMcpSync } from "./sync-outcome.js";
import { LifecycleFailureAdapter, withAdaptedStepFailures } from "../../failure-adapter.js";
import { ExtensionLifecycleFailed } from "../../errors.js";

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

    if (entry.kind === "inline") {
      const agentIds = yield* ws.getConfiguredAgents();
      const outcomes = yield* ws.runTransaction({
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
      });
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
        result: "success" as const,
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
      return yield* new ExtensionLifecycleFailed({
        category: "not_found",
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
    const outcomes = yield* ws.runTransaction({
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
    const agentOutcomes = agents.flatMap((agent, index) => {
      const outcome = outcomes[index];
      return outcome !== undefined && "targets" in outcome
        ? [{ agentId: agent.id, targets: outcome.targets }]
        : [];
    });
    return {
      result: "success" as const,
      message: appendWarningsToMessage(`Enabled ${op.args.serverName}`, warnings),
      artifact: enableArtifact({
        lockEntry: accepted,
        scope: ws.scope,
        targets: agentConfigTargets(agentOutcomes),
      }),
    };
  }).pipe(withAdaptedStepFailures);
