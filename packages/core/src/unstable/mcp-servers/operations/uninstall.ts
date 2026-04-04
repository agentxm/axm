/**
 * Uninstall MCP server executor — orchestrates per-server removal pipeline.
 *
 * Pipeline: read lockfile -> remove canonical dir -> remove lockfile/settings entry.
 * Simpler than skills — no agent symlinks.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AgentId } from "../../agents/index.js";
import type { CodingAgent, McpServerSyncOutcome } from "../../agents/coding-agent.js";
import { CodingAgentRepository } from "../../agents/index.js";
import { CliRenderer } from "../../cli-renderer/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { JobStepResult, Operation } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../extensions/index.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the uninstall-mcp-server operation.
 */
export interface UninstallMcpServerOperationArgs {
  readonly serverName: string;
  /** When true, enforce strict policy for MCP sync outcomes. */
  readonly strictAgentSync?: Option.Option<boolean>;
}

/**
 * Remove an MCP server from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UninstallMcpServerOperation = Operation<
  "uninstall-mcp-server",
  UninstallMcpServerOperationArgs
>;

const REQUIRED_AGENT_IDS: ReadonlySet<AgentId> = new Set<AgentId>([
  "claude-code",
  "opencode",
  "github-copilot",
  "cursor",
  "gemini-cli",
  "codex",
]);

interface AgentOutcome {
  readonly agentId: AgentId;
  readonly outcome: McpServerSyncOutcome;
}

const summarizeAgentSync = (
  outcomes: ReadonlyArray<AgentOutcome>,
): {
  readonly status: "green" | "degraded";
  readonly details: ReadonlyArray<string>;
} => {
  const degraded = outcomes.some(
    ({ outcome }) => outcome._tag === "failed" || outcome._tag === "fallback",
  );
  const details = outcomes.map(({ agentId, outcome }) =>
    outcome._tag === "success"
      ? `${agentId}:success`
      : outcome._tag === "fallback"
        ? `${agentId}:fallback:${outcome.fallbackFrom}`
        : `${agentId}:${outcome._tag}`,
  );

  return {
    status: degraded ? "degraded" : "green",
    details,
  };
};

const syncConfiguredAgentsOnUninstall = (args: {
  readonly wsBaseDir: string;
  readonly strict: boolean;
  readonly serverName: string;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const ws = yield* Workspace;
    const agentRepo = yield* CodingAgentRepository;

    const unknownConfiguredAgentIds = yield* agentRepo
      .getUnknownConfiguredAgentIds()
      .pipe(Effect.provideService(Workspace, ws));
    if (args.strict && unknownConfiguredAgentIds.length > 0) {
      const message = `Unknown configured agents in strict mode: ${unknownConfiguredAgentIds.join(", ")}`;
      return yield* makeAppError({
        code: "CODING_AGENT_UNKNOWN_CONFIGURED",
        what: message,
        details: unknownConfiguredAgentIds,
      });
    }

    if (unknownConfiguredAgentIds.length > 0) {
      yield* renderer.warn(
        `Skipping unknown configured agents: ${unknownConfiguredAgentIds.join(", ")}`,
      );
    }

    const configuredAgents = yield* agentRepo
      .getConfiguredAgents()
      .pipe(Effect.provideService(Workspace, ws));

    const outcomes = yield* Effect.forEach(
      configuredAgents,
      (agent: CodingAgent) =>
        agent
          .removeMcpServer({
            workspaceRoot: args.wsBaseDir,
            serverName: args.serverName,
          })
          .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
      { concurrency: "unbounded" },
    );

    const misconfigured = Array.filter(outcomes, ({ outcome }) => outcome._tag === "misconfigured");
    if (misconfigured.length > 0) {
      const details = misconfigured.map(({ agentId, outcome }) =>
        outcome._tag === "misconfigured" ? `${agentId}: ${outcome.reason}` : `${agentId}: invalid`,
      );
      return yield* makeAppError({
        code: "MCP_SERVER_AGENT_SYNC_MISCONFIGURED",
        what: `MCP server ${args.serverName} could not be removed from configured agents`,
        details,
      });
    }

    const failed = Array.filter(outcomes, ({ outcome }) => outcome._tag === "failed");
    if (args.strict && failed.length > 0) {
      const details = failed.map(({ agentId, outcome }) =>
        outcome._tag === "failed" ? `${agentId}: ${outcome.reason}` : `${agentId}: failed`,
      );
      return yield* makeAppError({
        code: "MCP_SERVER_AGENT_SYNC_FAILED",
        what: `MCP server ${args.serverName} removal sync failed in strict mode`,
        details,
      });
    }

    const strictDisabledFailures = Array.filter(
      outcomes,
      ({ agentId, outcome }) =>
        (outcome._tag === "disabled" ||
          (outcome._tag === "fallback" && outcome.fallbackFrom === "disabled")) &&
        args.strict &&
        REQUIRED_AGENT_IDS.has(agentId),
    );
    if (strictDisabledFailures.length > 0) {
      const details = strictDisabledFailures.map(({ agentId, outcome }) =>
        outcome._tag === "success" ? `${agentId}: disabled` : `${agentId}: ${outcome.reason}`,
      );
      return yield* makeAppError({
        code: "MCP_SERVER_AGENT_SYNC_DISABLED_REQUIRED",
        what: `MCP server ${args.serverName} removal sync disabled for required configured agents`,
        details,
      });
    }

    const warningOutcomes = Array.filter(
      outcomes,
      ({ outcome }) =>
        outcome._tag === "unsupported" ||
        outcome._tag === "disabled" ||
        outcome._tag === "failed" ||
        outcome._tag === "fallback",
    );
    if (warningOutcomes.length > 0) {
      const warningMessage = warningOutcomes
        .map(({ agentId, outcome }) =>
          outcome._tag === "success"
            ? `${agentId}:success`
            : outcome._tag === "fallback"
              ? `${agentId}:fallback(${outcome.fallbackFrom}):${outcome.reason}`
              : `${agentId}:${outcome.reason}`,
        )
        .join(", ");
      yield* renderer.warn(`MCP agent sync warnings for ${args.serverName}: ${warningMessage}`);
    }

    return summarizeAgentSync(outcomes);
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Uninstall-mcp-server operation handler.
 *
 * 1. Read lockfile to determine if server is installed
 * 2. Remove canonical directory from disk (if exists)
 * 3. Remove lockfile + settings entry
 */
export const uninstallMcpServer: (
  op: UninstallMcpServerOperation,
) => Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | Workspace | CliRenderer | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const strictAgentSync = Option.getOrElse(op.args.strictAgentSync ?? Option.none(), () => false);
    const base = ws.baseDir;

    const lockEntryOption = yield* ws.getLockedMcpServer(op.args.serverName).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "UNINSTALL_MCP_SERVER_LOCKFILE_READ_FAILED",
          what: `Failed to read lockfile: ${e.what}`,
          cause: e,
        }),
      ),
    );
    const lockEntry = Option.getOrUndefined(lockEntryOption);

    // Check if server exists on disk (scan registry extensions dir for any owner)
    const installedOnDisk = yield* checkInstalledOnDisk(fs, path, base, op.args.serverName);

    if (!lockEntry && !installedOnDisk) {
      return { result: "success", message: "not installed" } satisfies JobStepResult;
    }

    // Determine canonical path from lock entry or scan
    if (lockEntry?.type === "registry") {
      const canonicalPath = path.join(
        base,
        REGISTRY_EXTENSIONS_DIR,
        lockEntry.owner,
        "mcp-servers",
        lockEntry.name,
      );
      yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.catch(() => Effect.void));
    } else if (installedOnDisk) {
      // Remove from all known locations
      yield* removeFromAllMcpServerLocations(fs, path, base, op.args.serverName);
    }

    // Remove from settings + lockfile (swallow errors)
    yield* ws.removeMcpServer(op.args.serverName).pipe(Effect.catch(() => Effect.void));

    const agentSync = yield* syncConfiguredAgentsOnUninstall({
      wsBaseDir: ws.baseDir,
      strict: strictAgentSync,
      serverName: op.args.serverName,
    });

    return {
      result: "success",
      message: `Uninstalled ${op.args.serverName} (canonical=success, agent-sync=${agentSync.status})`,
    } satisfies JobStepResult;
  });

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const checkInstalledOnDisk = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  base: string,
  serverName: string,
) =>
  Effect.gen(function* () {
    const extensionsDir = pathService.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (!extensionsDirExists) return false;

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

    const results = yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.succeed(false);
        const serverPath = pathService.join(extensionsDir, scopeDir, "mcp-servers", serverName);
        return fsService.exists(serverPath).pipe(Effect.catch(() => Effect.succeed(false)));
      },
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
  });

const removeFromAllMcpServerLocations = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  base: string,
  serverName: string,
) =>
  Effect.gen(function* () {
    const extensionsDir = pathService.join(base, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));

    if (!extensionsDirExists) return;

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

    yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.void;
        const serverPath = pathService.join(extensionsDir, scopeDir, "mcp-servers", serverName);
        return fsService
          .remove(serverPath, { recursive: true })
          .pipe(Effect.catch(() => Effect.void));
      },
      { concurrency: "unbounded" },
    );
  });
