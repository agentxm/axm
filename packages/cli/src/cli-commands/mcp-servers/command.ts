import type { CommandModule } from "yargs";
import { subcommandFailHandler } from "../yargs-helpers.js";
import { installMcpServerCommand } from "./install/command.js";
import { uninstallMcpServerCommand } from "./uninstall/command.js";

export const mcpServersCommand: CommandModule = {
  command: "mcp-servers",
  describe: "Install and manage MCP servers",
  builder: (yargs) =>
    yargs
      .command(installMcpServerCommand)
      .command(uninstallMcpServerCommand)
      .demandCommand(1)
      .example(
        "$0 mcp-servers install @acme/mcp-servers/my-server",
        "Install an MCP server from registry",
      )
      .example("$0 mcp-servers uninstall my-server", "Uninstall an MCP server")
      .fail(subcommandFailHandler),
  handler: () => {},
};
