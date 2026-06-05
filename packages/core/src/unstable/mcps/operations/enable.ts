/**
 * Enable MCP server executor.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CodingAgentRepository, syncInlineMcpServerToAgent } from "../../agents/index.js";
import type { McpServerSyncOutcome } from "../../agents/coding-agent.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  normalizeHandle,
} from "../../extensions/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { JobStepArtifactTarget, JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import type { McpServerLockEntry } from "../../lockfile/index.js";
import { agentConfigTargets, mcpServerArtifact, mcpSettingsTarget } from "./artifact.js";

export type EnableMcpServerOperation = Operation<
  "enable-mcp-server",
  { readonly serverName: string }
>;

const canonicalPathFor = (
  path: Path.Path,
  base: string,
  name: string,
  lockEntry: McpServerLockEntry,
): string =>
  lockEntry.type === "registry"
    ? path.join(base, REGISTRY_EXTENSIONS_DIR, lockEntry.owner, "mcps", lockEntry.name)
    : path.join(base, EXTERNAL_EXTENSIONS_DIR, "mcps", name);

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

const appendResultWarnings = (message: string, warnings: ReadonlyArray<string>): string =>
  warnings.length === 0 ? message : `${message}; ${warnings.join("; ")}`;

const enableArtifact = (args: {
  readonly lockEntry: McpServerLockEntry | undefined;
  readonly scope: "project" | "user";
  readonly targets: ReadonlyArray<JobStepArtifactTarget>;
}) => {
  return mcpServerArtifact({
    lockEntry: args.lockEntry,
    scope: args.scope,
    change: "updated",
    targets: [mcpSettingsTarget("updated"), ...args.targets],
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

    yield* ws.updateMcpServerEntry(op.args.serverName, (current) => ({
      ...current,
      enabled: true,
    }));

    const lockEntry = yield* ws.getLockedMcpServer(op.args.serverName);
    if (Option.isNone(lockEntry)) {
      return {
        result: "success",
        message: `Enabled ${op.args.serverName}`,
        artifact: enableArtifact({ lockEntry: undefined, scope: ws.scope, targets: [] }),
      };
    }

    if (lockEntry.value.type === "inline") {
      const agentIds = yield* ws.getConfiguredAgents();
      const outcomes = yield* Effect.forEach(
        agentIds,
        (agentId) =>
          syncInlineMcpServerToAgent(agentId, {
            workspaceRoot: ws.baseDir,
            serverName: op.args.serverName,
            entry: { ...entry, enabled: true },
            scope: ws.scope,
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          ),
        { concurrency: "unbounded" },
      );
      const warnings = formatAgentSyncWarnings(op.args.serverName, outcomes);
      const agentOutcomes = agentIds.flatMap((agentId, index) => {
        const outcome = outcomes[index];
        return outcome !== undefined && "targets" in outcome
          ? [{ agentId, targets: outcome.targets }]
          : [];
      });

      return {
        result: "success",
        message: appendResultWarnings(`Enabled ${op.args.serverName}`, warnings),
        artifact: enableArtifact({
          lockEntry: lockEntry.value,
          scope: ws.scope,
          targets: agentConfigTargets(agentOutcomes),
        }),
      };
    }

    const canonicalPath = canonicalPathFor(path, ws.baseDir, op.args.serverName, lockEntry.value);
    const exists = yield* fs.exists(canonicalPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      return yield* makeAppError({
        code: "not_found",
        detail: `MCP server files for "${op.args.serverName}" not found at ${canonicalPath}`,
      });
    }

    const agents = yield* agentRepo.getConfiguredAgents();
    const outcomes = yield* Effect.forEach(
      agents,
      (agent) =>
        agent.addMcpServer({
          workspaceRoot: ws.baseDir,
          scope: ws.scope,
          serverName: op.args.serverName,
          canonicalPath,
          owner:
            lockEntry.value.type === "registry" ? lockEntry.value.owner : normalizeHandle("@local"),
          resolvedVersion:
            lockEntry.value.type === "registry" ? lockEntry.value.resolvedVersion : "0.0.0",
          enabled: true,
          configValues: entry.env,
        }),
      { concurrency: "unbounded" },
    );
    const warnings = formatAgentSyncWarnings(op.args.serverName, outcomes);
    const agentOutcomes = agents.flatMap((agent, index) => {
      const outcome = outcomes[index];
      return outcome !== undefined && "targets" in outcome
        ? [{ agentId: agent.id, targets: outcome.targets }]
        : [];
    });

    return {
      result: "success",
      message: appendResultWarnings(`Enabled ${op.args.serverName}`, warnings),
      artifact: enableArtifact({
        lockEntry: lockEntry.value,
        scope: ws.scope,
        targets: agentConfigTargets(agentOutcomes),
      }),
    };
  });
