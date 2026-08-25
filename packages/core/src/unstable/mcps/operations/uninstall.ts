/**
 * Uninstall MCP server executor — orchestrates per-server removal pipeline.
 *
 * Pipeline: resolve desired/observed state -> remove canonical source -> clear
 * settings and accepted resolution.
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
import { makeAppError, type AppError } from "../../app-error/index.js";
import { appendWarningsToMessage } from "../../plan/job-step-message.js";
import type { JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../extensions/index.js";
import { agentConfigTarget, mcpServerArtifact, mcpSettingsTarget } from "./artifact.js";

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
  "github-copilot-cli",
  "cursor",
  "gemini-cli",
  "codex",
]);

interface AgentOutcome {
  readonly agentId: AgentId;
  readonly outcome: McpServerSyncOutcome;
}

interface AgentSyncSummary {
  readonly status: "green" | "degraded";
  readonly details: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
  readonly agentIds: ReadonlyArray<AgentId>;
}

const formatAgentSyncWarning = (
  serverName: string,
  outcomes: ReadonlyArray<AgentOutcome>,
): string => {
  const warningMessage = outcomes
    .map(({ agentId, outcome }) =>
      outcome._tag === "success"
        ? `${agentId}:success`
        : outcome._tag === "fallback"
          ? `${agentId}:fallback(${outcome.fallbackFrom}):${outcome.reason}`
          : `${agentId}:${outcome.reason}`,
    )
    .join(", ");

  return `MCP agent sync warnings for ${serverName}: ${warningMessage}`;
};

const summarizeAgentSync = (
  outcomes: ReadonlyArray<AgentOutcome>,
  warnings: ReadonlyArray<string>,
): AgentSyncSummary => {
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
    warnings,
    agentIds: outcomes.map(({ agentId }) => agentId),
  };
};

const syncConfiguredAgentsOnUninstall = (args: {
  readonly wsBaseDir: string;
  readonly scope: "project" | "user";
  readonly strict: boolean;
  readonly serverName: string;
}) =>
  Effect.gen(function* () {
    const agentRepo = yield* CodingAgentRepository;
    const warnings: Array<string> = [];

    const unknownConfiguredAgentIds = yield* agentRepo.getUnknownConfiguredAgentIds();
    if (args.strict && unknownConfiguredAgentIds.length > 0) {
      const message = `Unknown configured agents in strict mode: ${unknownConfiguredAgentIds.join(", ")}`;
      return yield* makeAppError({
        code: "not_found",
        detail: message,
      });
    }

    if (unknownConfiguredAgentIds.length > 0) {
      warnings.push(`Skipping unknown configured agents: ${unknownConfiguredAgentIds.join(", ")}`);
    }

    const configuredAgents = yield* agentRepo.getConfiguredAgents();

    const outcomes = yield* Effect.forEach(
      configuredAgents,
      (agent: CodingAgent) =>
        agent
          .removeMcpServer({
            workspaceRoot: args.wsBaseDir,
            scope: args.scope,
            serverName: args.serverName,
          })
          .pipe(Effect.map((outcome) => ({ agentId: agent.id, outcome }))),
      { concurrency: "unbounded" },
    );

    const misconfigured = Array.filter(outcomes, ({ outcome }) => outcome._tag === "misconfigured");
    if (misconfigured.length > 0) {
      return yield* makeAppError({
        code: "internal",
        detail: `MCP server ${args.serverName} could not be removed from configured agents`,
      });
    }

    const failed = Array.filter(outcomes, ({ outcome }) => outcome._tag === "failed");
    if (args.strict && failed.length > 0) {
      return yield* makeAppError({
        code: "internal",
        detail: `MCP server ${args.serverName} removal sync failed in strict mode`,
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
      return yield* makeAppError({
        code: "internal",
        detail: `MCP server ${args.serverName} removal sync disabled for required configured agents`,
      });
    }

    const warningOutcomes = Array.filter(
      outcomes,
      ({ outcome }) =>
        outcome._tag === "unsupported" ||
        outcome._tag === "disabled" ||
        outcome._tag === "needs-input" ||
        outcome._tag === "failed" ||
        outcome._tag === "fallback",
    );
    if (warningOutcomes.length > 0) {
      warnings.push(formatAgentSyncWarning(args.serverName, warningOutcomes));
    }

    return summarizeAgentSync(outcomes, warnings);
  });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Uninstall-mcp-server operation handler.
 *
 * 1. Resolve configured and observed state
 * 2. Remove canonical directory from disk (if exists)
 * 3. Remove settings and accepted resolution
 */
export const uninstallMcpServer: (
  op: UninstallMcpServerOperation,
) => Effect.Effect<
  JobStepResult,
  AppError,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | CodingAgentRepository
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const strictAgentSync = Option.getOrElse(op.args.strictAgentSync ?? Option.none(), () => false);
    const base = ws.baseDir;

    const desired = yield* ws.getDesiredStateGraph();
    if (!desired.complete) {
      return yield* makeAppError({
        code: "conflict",
        detail: "Cannot uninstall the MCP server while the desired extension graph is incomplete.",
        recover: "Repair or reinstall the configured packs, then retry.",
      });
    }
    const desiredNode = desired.nodes.find(
      (node) => node.type === "mcp-server" && node.name === op.args.serverName,
    );
    const installedOnDisk = yield* checkInstalledOnDisk(fs, path, base, op.args.serverName);

    if (desiredNode === undefined && !installedOnDisk) {
      return { result: "success", message: "not installed" } satisfies JobStepResult;
    }
    if (desiredNode?.origins.some((origin) => origin.type === "pack") === true) {
      yield* ws.removeMcpServerSettings(op.args.serverName);
      return {
        result: "success",
        message: "Kept on disk because dependency is still required by an installed pack",
      } satisfies JobStepResult;
    }

    if (installedOnDisk) {
      yield* removeFromAllMcpServerLocations(fs, path, base, op.args.serverName);
    }

    // Remove from settings + lockfile (best-effort; preserve warning in result).
    const removeWarning = yield* ws.removeMcpServer(op.args.serverName).pipe(
      Effect.as(Option.none<string>()),
      Effect.catch((e) =>
        Effect.succeed(Option.some(`MCP server removal from settings failed: ${e.detail}`)),
      ),
    );

    const agentSync = yield* syncConfiguredAgentsOnUninstall({
      wsBaseDir: ws.baseDir,
      scope: ws.scope,
      strict: strictAgentSync,
      serverName: op.args.serverName,
    });

    const warnings = Option.match(removeWarning, {
      onNone: () => agentSync.warnings,
      onSome: (warning) => [warning, ...agentSync.warnings],
    });
    const agentTarget = agentConfigTarget("removed", agentSync.agentIds);
    return {
      result: "success",
      message: appendWarningsToMessage(
        `Uninstalled ${op.args.serverName} (canonical=success, agent-sync=${agentSync.status})`,
        warnings,
      ),
      artifact: mcpServerArtifact({
        lockEntry: undefined,
        scope: ws.scope,
        change: "removed",
        targets: [
          mcpSettingsTarget(ws.scope, "removed"),
          ...(agentTarget === undefined ? [] : [agentTarget]),
        ],
      }),
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
        const serverPath = pathService.join(extensionsDir, scopeDir, "mcps", serverName);
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
        const serverPath = pathService.join(extensionsDir, scopeDir, "mcps", serverName);
        return fsService
          .remove(serverPath, { recursive: true })
          .pipe(Effect.catch(() => Effect.void));
      },
      { concurrency: "unbounded" },
    );
  });
