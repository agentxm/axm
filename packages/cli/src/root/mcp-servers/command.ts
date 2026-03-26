import { Command } from "effect/unstable/cli";

import { showHelpFor } from "../../help.js";
import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";

export const mcpServersCommand = Command.make("mcp-servers", {}, () =>
  showHelpFor(["axm", "mcp-servers"]),
).pipe(
  Command.withDescription("Install and manage MCP servers"),
  Command.withExamples([
    {
      command: "axm mcp-servers install @acme/mcp-servers/my-server",
      description: "Install an MCP server from the registry",
    },
    { command: "axm mcp-servers uninstall my-server", description: "Remove an installed server" },
  ]),
  Command.withSubcommands([installCommand, uninstallCommand]),
);
