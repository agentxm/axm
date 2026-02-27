/**
 * Uninstall MCP server handler - Effect-based orchestration for `axm mcp-servers uninstall`.
 *
 * Delegates to shared uninstall command workflow via UninstallMcpServerCommandWorkflowActions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { TelemetryClient } from "../../../telemetry/index.js";
import { runUninstallCommandWorkflow } from "../../../workflows/uninstall-command/workflow.js";
import {
  UninstallMcpServerCommandWorkflowActions,
  type UninstallMcpServerHandlerArgs,
} from "./command-actions.js";

export type { UninstallMcpServerHandlerArgs } from "./command-actions.js";

/**
 * Handles the `axm mcp-servers uninstall` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstallMcpServer = (args: UninstallMcpServerHandlerArgs) =>
  Effect.gen(function* () {
    const tc = yield* TelemetryClient;
    yield* tc.trackEvent("command_invoked", { command: "mcp-servers uninstall" });
    const actions = yield* UninstallMcpServerCommandWorkflowActions;
    yield* runUninstallCommandWorkflow(args, actions);
  });
