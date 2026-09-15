/**
 * Enable MCP server executor.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CodingAgentRepository } from "../../../projection/index.js";
import {
  NativeWriteAuthority,
  syncInlineMcpServerToAgents,
  syncManifestMcpServerToAgents,
} from "../../../projection/agent-adapters/index.js";
import {
  normalizeHandle,
  parseExtensionFqnParts,
} from "@agentxm/extension-model/unstable/extensions";
import type { StepFailure } from "../../../transitions/planning/index.js";
import { appendWarningsToMessage } from "../../../transitions/planning/index.js";
import type {
  JobStepArtifactTarget,
  JobStepResult,
  Operation,
} from "../../../transitions/planning/index.js";
import {
  type DesiredStateReader,
  type LockfileReader,
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
} from "../../../desired-state/index.js";
import {
  WorkspaceTransactionScope,
  runWorkspaceTransaction,
} from "../../../transitions/settlement/index.js";
import type { McpServerLockEntry } from "../../../desired-state/index.js";
import {
  agentConfigTargets,
  mcpServerArtifact,
  mcpSettingsTarget,
} from "../../../materialization/index.js";
import { usableAcceptedCanonicalObservation } from "../../../desired-state/index.js";
import { mcpSyncWarnings, requireSuccessfulMcpSync } from "./sync-outcome.js";
import {
  StepFailureConversion,
  withAdaptedStepFailures,
} from "../../../lifecycle/step-failure-conversion.js";
import { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";

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
  | WorkspaceLocation
  | SettingsReader
  | SettingsWriter
  | LockfileReader
  | DesiredStateReader
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

    if (entry.kind === "inline") {
      const agents = yield* agentRepo.getConfiguredAgents();
      const agentIds = agents.map(({ id }) => id);
      const outcomes = yield* runWorkspaceTransaction({
        transition: Effect.gen(function* () {
          const synced = yield* syncInlineMcpServerToAgents(agentIds, {
            workspaceRoot: location.baseDir,
            serverName: op.args.serverName,
            entry: { ...entry, enabled: true },
            scope: location.scope,
          });
          const agentOutcomes = agentIds.map((agentId, index) => ({
            agentId,
            outcome: synced[index] ?? {
              _tag: "failed" as const,
              reason: "Agent sync returned no outcome",
            },
          }));
          yield* requireSuccessfulMcpSync(op.args.serverName, agentOutcomes);
          yield* settingsWriter.updateEntry("mcp-server", op.args.serverName, (current) => ({
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
          scope: location.scope,
          targets: agentConfigTargets(agentOutcomes),
        }),
      };
    }

    const canonical = yield* usableAcceptedCanonicalObservation({
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
    const agentIds = agents.map(({ id }) => id);
    const outcomes = yield* runWorkspaceTransaction({
      transition: Effect.gen(function* () {
        const synced = yield* syncManifestMcpServerToAgents({
          agentIds,
          workspaceRoot: location.baseDir,
          scope: location.scope,
          serverName: op.args.serverName,
          canonicalPath,
          owner,
          resolvedVersion,
          enabled: true,
          configValues: entry.env,
        });
        yield* requireSuccessfulMcpSync(
          op.args.serverName,
          agentIds.map((agentId, index) => ({
            agentId,
            outcome: synced[index] ?? {
              _tag: "failed" as const,
              reason: "Agent sync returned no outcome",
            },
          })),
        );
        yield* settingsWriter.updateEntry("mcp-server", op.args.serverName, (current) => ({
          ...current,
          enabled: true,
        }));
        return synced;
      }),
      validate: () => Effect.void,
    });
    const warnings = mcpSyncWarnings(
      op.args.serverName,
      agentIds.map((agentId, index) => ({
        agentId,
        outcome: outcomes[index] ?? {
          _tag: "failed" as const,
          reason: "Agent sync returned no outcome",
        },
      })),
    );
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
        lockEntry: accepted,
        scope: location.scope,
        targets: agentConfigTargets(agentOutcomes),
      }),
    };
  }).pipe(withAdaptedStepFailures);
