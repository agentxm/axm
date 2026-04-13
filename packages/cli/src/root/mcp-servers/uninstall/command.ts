import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { handleUninstallMcpServer } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name of the MCP server to uninstall"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if agents are currently configured to use this server"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, yes, force, preview }) =>
    handleUninstallMcpServer({ serverName: name }, { yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime("mcp-servers uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall an MCP server"),
  Command.withExamples([
    {
      command: "axm mcp-servers uninstall my-server",
      description: "Remove an MCP server you no longer need",
    },
    {
      command: "axm mcp-servers uninstall my-server --preview",
      description: "Check what would be removed first",
    },
    {
      command: "axm mcp-servers uninstall my-server --yes",
      description: "Remove without confirmation (scripts/CI)",
    },
  ]),
);
