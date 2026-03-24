import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleUninstallMcpServer } from "../../cli-commands/mcp-servers/uninstall/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const uninstallCommand = Command.make(
  "uninstall",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name of the MCP server to uninstall"),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ name, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
        handleUninstallMcpServer({ serverName: name }),
      ),
      { command: "mcp-servers uninstall", flags: { yes, force, preview } },
    ),
).pipe(Command.withDescription("Uninstall an MCP server"));
