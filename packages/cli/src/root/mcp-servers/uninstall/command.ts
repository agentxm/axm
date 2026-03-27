import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleUninstallMcpServer } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";

const uninstallConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the MCP server to uninstall"),
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        DEFAULT_WORKSPACE_SCOPE,
        handleUninstallMcpServer({ serverName: name }, { yes, force, preview }),
      ),
      { command: "mcp-servers uninstall" },
    ),
).pipe(withArgvTracking(uninstallConfig), Command.withDescription("Uninstall an MCP server"));
