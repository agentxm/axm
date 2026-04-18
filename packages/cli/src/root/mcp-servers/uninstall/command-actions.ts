/**
 * MCP server uninstall workflow actions service.
 *
 * Implements UninstallExtensionCommandWorkflowActions for MCP servers.
 * The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { Workspace } from "@agentxm/client-core/unstable/workspace";
import {
  McpServerManager,
  type McpServerExtensionRef,
} from "@agentxm/client-core/unstable/mcp-servers";
import type { Plan } from "@agentxm/client-core/unstable/workspace";
import type {
  ExtensionTarget,
  McpServerExtensionTarget,
} from "@agentxm/client-core/unstable/workspace";
import { buildUninstallOperation } from "@agentxm/client-core/unstable/extensions";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { UninstallMcpServerCommandIntent } from "./intent.js";

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

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class UninstallMcpServerCommandWorkflowActions extends ServiceMap.Service<
  UninstallMcpServerCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallMcpServerHandlerArgs,
    ParsedMcpServerUninstallArgs,
    UninstallMcpServerCommandIntent
  >
>()("axm.sh/UninstallMcpServerCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const UninstallMcpServerCommandWorkflowActionsLive = Layer.effect(
  UninstallMcpServerCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const mcpServerMgr = yield* McpServerManager;

    const parseArgs = (
      args: UninstallMcpServerHandlerArgs,
    ): Effect.Effect<ParsedMcpServerUninstallArgs, AppError> =>
      Effect.succeed({ serverName: args.serverName.trim() });

    const finalizeIntent = (
      parsed: ParsedMcpServerUninstallArgs,
    ): Effect.Effect<UninstallMcpServerCommandIntent, AppError> =>
      Effect.gen(function* () {
        const lockEntry = yield* ws.getLockedMcpServer(parsed.serverName);
        if (Option.isNone(lockEntry)) {
          return yield* makeAppError({
            code: "MCP_SERVER_NOT_INSTALLED",
            what: `MCP server "${parsed.serverName}" is not installed`,
            howToFix: "Check installed MCP servers and verify the name.",
          });
        }

        const target: McpServerExtensionTarget = {
          type: "mcp-server",
          name: parsed.serverName,
        };

        return { targets: [target] };
      });

    const buildUninstallPlan = (
      intent: UninstallMcpServerCommandIntent,
    ): Effect.Effect<Plan, AppError> => {
      const retentionPolicy = {
        isRequiredByInstalledPack: (args: { readonly target: ExtensionTarget }) =>
          ws.isExtensionRequiredByInstalledExtensionPack(args.target),
        markDependencyRetainedInLockfile: (args: { readonly target: ExtensionTarget }) =>
          ws.markDependencyRetainedInLockfile(args.target),
      };

      const steps = intent.targets.map((target) =>
        buildUninstallOperation<McpServerExtensionRef>(mcpServerMgr, retentionPolicy, { target }),
      );

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
  }),
);
