import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { handleUninstallMcpServer } from "./uninstall/handler.js";

const removeConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the MCP server to remove")),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if agents are currently configured to use this server"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;

export const removeCommand = Command.make("remove", removeConfig, ({ name, yes, force, preview }) =>
  handleUninstallMcpServer({ serverName: name }, { yes, force, preview }).pipe(
    withWorkspace(DEFAULT_WORKSPACE_SCOPE),
    withRuntime("mcps remove"),
  ),
).pipe(
  withArgvTracking(removeConfig),
  Command.withAlias("rm"),
  Command.withDescription("Remove an MCP server"),
  Command.withExamples([
    {
      command: "axm mcps remove linear",
      description: "Remove an MCP server you no longer need",
    },
    {
      command: "axm mcps remove linear --preview",
      description: "Check what would be removed first",
    },
  ]),
);
