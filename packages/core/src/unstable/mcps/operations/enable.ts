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
import type { McpServerSyncOutcome } from "../../agents/coding-agent.js";
import { normalizeHandle, parseExtensionFqnParts } from "../../extensions/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import { appendWarningsToMessage } from "../../plan/job-step-message.js";
import type { JobStepArtifactTarget, JobStepResult, Operation } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import type { McpServerLockEntry } from "../../lockfile/index.js";
import { agentConfigTargets, mcpServerArtifact, mcpSettingsTarget } from "./artifact.js";
import { usableTrustedCanonicalObservation } from "../../workspace/trusted-canonical-ref.js";

export type EnableMcpServerOperation = Operation<
  "enable-mcp-server",
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

    if (entry.source === "inline") {
      const agentIds = yield* ws.getConfiguredAgents();
      const outcomes = yield* syncInlineMcpServerToAgents(agentIds, {
        workspaceRoot: ws.baseDir,
        serverName: op.args.serverName,
        entry: { ...entry, enabled: true },
        scope: ws.scope,
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
      const warnings = formatAgentSyncWarnings(op.args.serverName, outcomes);
      const agentOutcomes = agentIds.flatMap((agentId, index) => {
        const outcome = outcomes[index];
        return outcome !== undefined && "targets" in outcome
          ? [{ agentId, targets: outcome.targets }]
          : [];
      });

      yield* ws.updateMcpServerEntry(op.args.serverName, (current) => ({
        ...current,
        enabled: true,
      }));

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

    const canonical = yield* usableTrustedCanonicalObservation({
      workspace: ws,
      type: "mcp-server",
      name: op.args.serverName,
    });
    if (Option.isNone(canonical)) {
      return yield* makeAppError({
        code: "not_found",
        detail: `Trusted MCP server content for "${op.args.serverName}" is not usable`,
        suggestions: [
          {
            description: "Try reinstalling the MCP server.",
            cmd: "axm mcps install <source>",
          },
        ],
      });
    }
    const canonicalPath = canonical.value.observation.path;
    const trust = canonical.value.trust;
    const identity =
      trust.authority === "workspace"
        ? trust.sourceIdentity.slice("workspace:".length)
        : trust.sourceIdentity;
    const trustedIdentity =
      trust.authority === "registry" || trust.authority === "workspace"
        ? parseExtensionFqnParts(identity)
        : undefined;
    const owner =
      trustedIdentity?.type === "mcp-server" ? trustedIdentity.owner : normalizeHandle("@local");
    const resolvedVersion = trust.resolvedVersion ?? "0.0.0";

    const agents = yield* agentRepo.getConfiguredAgents();
    const outcomes = yield* Effect.forEach(
      agents,
      (agent) =>
        agent.addMcpServer({
          workspaceRoot: ws.baseDir,
          scope: ws.scope,
          serverName: op.args.serverName,
          canonicalPath,
          owner,
          resolvedVersion,
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
    yield* ws.updateMcpServerEntry(op.args.serverName, (current) => ({
      ...current,
      enabled: true,
    }));

    return {
      result: "success",
      message: appendWarningsToMessage(`Enabled ${op.args.serverName}`, warnings),
      artifact: enableArtifact({
        lockEntry: undefined,
        scope: ws.scope,
        targets: agentConfigTargets(agentOutcomes),
      }),
    };
  });
