import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

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
  readonly env: Option.Option<string>;
  readonly nonInteractive: boolean;
}

export const handleInstallMcpServer = (
  args: McpServerInstallHandlerArgs,
  flags: InstallMcpServerFlags,
) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source)) {
      return yield* handleWorkspaceInstall({
        command: "mcps.install",
        type: Option.some("mcp-server"),
        planName: "Install MCP servers",
        planDescription: Option.some("Install configured MCP servers"),
        flags,
      });
    }

    const actions = yield* InstallMcpServerCommandWorkflowActions;
    const sourceArgs: InstallMcpServerHandlerArgs = {
      source: args.source.value,
      env: args.env,
      nonInteractive: args.nonInteractive,
    };
    const resolution = yield* runInstallCommandWorkflow(sourceArgs, actions, flags);
    yield* emitPlanResolutionResult("mcps.install", resolution);
  });
