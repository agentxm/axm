/**
 * MCP server uninstall workflow actions service.
 *
 * Implements UninstallExtensionCommandWorkflowActions for MCP servers.
 * The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "@agentxm/extension-management/unstable/app-error";
import { WorkspaceMutations, type McpServerExtensionTarget } from "@agentxm/workspace-state";
import { type McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import {
  McpServerManager,
  mcpServerArtifact,
  mcpSourceTarget,
} from "@agentxm/extension-management/unstable/mcps";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/workspace-operations";
import { buildUninstallOperation } from "@agentxm/extension-management/unstable/extensions";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/extension-management/unstable/extension-lifecycle";
import type { UninstallMcpServerCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import {
  workspaceLockfilePath,
  workspaceSettingsPath,
} from "../../shared/workspace-display-paths.js";

// -----------------------------------------------------------------------------
// Handler Args
// -----------------------------------------------------------------------------

export interface UninstallMcpServerHandlerArgs {
  readonly serverName: string;
}

// -----------------------------------------------------------------------------
// Parsed Args
// -----------------------------------------------------------------------------

export interface ParsedMcpServerUninstallArgs {
  readonly serverName: string;
}

type UninstallMcpServerActions = UninstallExtensionCommandWorkflowActions<
  UninstallMcpServerHandlerArgs,
  ParsedMcpServerUninstallArgs,
  UninstallMcpServerCommandIntent
>;

export const UninstallMcpServerCommandWorkflowActions = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const mcpServerMgr = yield* McpServerManager;

  const parseArgs = (
    args: UninstallMcpServerHandlerArgs,
  ): Effect.Effect<ParsedMcpServerUninstallArgs, AppError> =>
    Effect.succeed({ serverName: args.serverName.trim() });

  const finalizeIntent = (
    parsed: ParsedMcpServerUninstallArgs,
  ): Effect.Effect<UninstallMcpServerCommandIntent, AppError> =>
    Effect.succeed({
      targets: [
        {
          type: "mcp-server",
          name: parsed.serverName,
        } satisfies McpServerExtensionTarget,
      ],
    });

  const buildUninstallPlan = (
    intent: UninstallMcpServerCommandIntent,
  ): Effect.Effect<Plan, AppError> => {
    const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

    const steps = intent.targets.map((target): PlannedJobStep => {
      const step = buildUninstallOperation<McpServerExtensionRef>(mcpServerMgr, retentionPolicy, {
        target,
      });
      if (step.readiness !== "ready") {
        return step;
      }
      return {
        ...step,
        run: Effect.gen(function* () {
          const lockEntry = Option.getOrUndefined(
            yield* ws
              .getLockedMcpServer(target.name)
              .pipe(Effect.catch(() => Effect.succeed(Option.none()))),
          );
          const result = yield* step.run;
          if (result.result !== "success") return result;
          const unchanged = result.disposition === "unchanged";
          const sourceTarget =
            lockEntry?.type === "registry"
              ? mcpSourceTarget(ws.scope, lockEntry, "removed")
              : undefined;
          return {
            ...result,
            artifact: mcpServerArtifact({
              lockEntry,
              scope: ws.scope,
              change: unchanged ? "unchanged" : "removed",
              targets: unchanged
                ? []
                : [
                    { path: workspaceLockfilePath(ws.scope), change: "updated" },
                    { path: workspaceSettingsPath(ws.scope), change: "updated" },
                    ...(sourceTarget === undefined ? [] : [sourceTarget]),
                  ],
            }),
          } satisfies JobStepResult;
        }),
      };
    });

    return Effect.succeed({
      _tag: "Plan",
      name: "Uninstall MCP server",
      description: Option.some(
        `Uninstall MCP server ${intent.targets.map((t) => t.name).join(", ")}`,
      ),
      jobs: [{ concurrency: 1 as const, steps }],
    } satisfies Plan);
  };

  return {
    parseArgs,
    finalizeIntent,
    buildUninstallPlan,
  };
}).pipe(Effect.map((actions): UninstallMcpServerActions => actions));
