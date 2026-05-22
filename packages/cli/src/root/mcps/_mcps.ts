import { Command } from "effect/unstable/cli";

import { mcpsVersionCommand } from "../shared/version-command.js";
import { disableCommand } from "./disable.js";
import { enableCommand } from "./enable.js";
import { installCommand } from "./install/command.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { publishCommand } from "./publish.js";
import { uninstallCommand } from "./uninstall/command.js";
import { updateCommand } from "./update.js";

export const mcpsCommand = Command.make("mcps").pipe(
  Command.withDescription("Manage MCP servers"),
  Command.withExamples([
    {
      command: "axm mcps install @acme/mcps/my-server",
      description: "Add an MCP server from the registry",
    },
    {
      command: "axm mcps uninstall my-server",
      description: "Remove an MCP server",
    },
    {
      command: "axm mcps version @acme/mcps/my-server patch",
      description: "Bump an MCP server version",
    },
  ]),
  Command.withSubcommands([
    installCommand,
    uninstallCommand,
    listCommand,
    enableCommand,
    disableCommand,
    updateCommand,
    newCommand,
    publishCommand,
    mcpsVersionCommand,
  ]),
);
