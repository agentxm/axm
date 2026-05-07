import { Command } from "effect/unstable/cli";

import { mcpServersVersionCommand } from "../shared/version-command.js";
import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";

export const mcpServersCommand = Command.make("mcp-servers").pipe(
  Command.withDescription("Manage MCP servers"),
  Command.withExamples([
    {
      command: "axm mcp-servers install @acme/mcp-servers/my-server",
      description: "Add an MCP server from the registry",
    },
    {
      command: "axm mcp-servers uninstall my-server",
      description: "Remove an MCP server",
    },
    {
      command: "axm mcp-servers version @acme/mcp-servers/my-server patch",
      description: "Bump an MCP server version",
    },
  ]),
  Command.withSubcommands([installCommand, uninstallCommand, mcpServersVersionCommand]),
);
