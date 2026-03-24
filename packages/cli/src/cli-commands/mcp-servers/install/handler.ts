/**
 * Install MCP server handler - Effect-based orchestration for `axm mcp-servers install`.
 *
 * Delegates to shared install command workflow via InstallMcpServerCommandWorkflowActions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "../../../workflows/install-command/workflow.js";
import {
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "./command-actions.js";

export type { InstallMcpServerHandlerArgs } from "./command-actions.js";

/**
 * Handles the `axm mcp-servers install` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstallMcpServer = (args: InstallMcpServerHandlerArgs) =>
  Effect.gen(function* () {
    const actions = yield* InstallMcpServerCommandWorkflowActions;
    yield* runInstallCommandWorkflow(args, actions);
  });
