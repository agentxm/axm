/**
 * MCP server uninstall workflow actions service.
 *
 * Implements UninstallExtensionCommandWorkflowActions for MCP servers.
 * The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeCliError, type CliError } from "../../../cli-error/index.js";
import { Workspace } from "../../../workspace/service.js";
import { McpServerManager } from "../../../extensions/mcp-servers/manager.js";
import type { Plan } from "../../../workspace/plan.js";
import type {
  ExtensionTarget,
  McpServerExtensionTarget,
} from "../../../workflows/install-operation/index.js";
import { buildUninstallOperation } from "../../../workflows/uninstall-operation/index.js";
import type { UninstallExtensionCommandWorkflowActions } from "../../../workflows/uninstall-command/index.js";
import type { UninstallMcpServerCommandIntent } from "./intent.js";
import type { McpServerExtensionRef } from "../../../sources/types.js";

// -----------------------------------------------------------------------------
// Handler Args
// -----------------------------------------------------------------------------

export interface UninstallMcpServerHandlerArgs {
  readonly serverName: string;
  readonly yes: boolean;
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

export class UninstallMcpServerCommandWorkflowActions extends Context.Tag(
  "UninstallMcpServerCommandWorkflowActions",
)<
  UninstallMcpServerCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallMcpServerHandlerArgs,
    ParsedMcpServerUninstallArgs,
    UninstallMcpServerCommandIntent
  >
>() {}

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
    ): Effect.Effect<ParsedMcpServerUninstallArgs, CliError> =>
      Effect.succeed({ serverName: args.serverName.trim() });

    const finalizeIntent = (
      parsed: ParsedMcpServerUninstallArgs,
    ): Effect.Effect<UninstallMcpServerCommandIntent, CliError> =>
      Effect.gen(function* () {
        const lockEntry = yield* ws.getLockedMcpServer(parsed.serverName);
        if (Option.isNone(lockEntry)) {
          return yield* makeCliError({
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
    ): Effect.Effect<Plan, CliError> => {
      const retentionPolicy = {
        isRequiredByInstalledPack: (args: { readonly target: ExtensionTarget }) =>
          ws.isExtensionRequiredByInstalledPack(args.target),
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
