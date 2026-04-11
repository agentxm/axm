import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";

import { emitPlanResolutionResult } from "../../../json-output.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import {
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "./command-actions.js";

export interface InstallMcpServerFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export interface McpServerInstallHandlerArgs {
  readonly source: Option.Option<string>;
}

export const handleInstallMcpServer = (
  args: McpServerInstallHandlerArgs,
  flags: InstallMcpServerFlags,
) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source)) {
      return yield* handleWorkspaceInstall({
        command: "mcp-servers.install",
        type: Option.some("mcp-server"),
        planName: "Install MCP server(s)",
        planDescription: Option.some("Install configured MCP servers"),
        flags,
      });
    }

    const actions = yield* InstallMcpServerCommandWorkflowActions;
    const sourceArgs: InstallMcpServerHandlerArgs = { source: args.source.value };
    const resolution = yield* runInstallCommandWorkflow(sourceArgs, actions, flags);
    yield* emitPlanResolutionResult("mcp-servers.install", resolution);
  });
