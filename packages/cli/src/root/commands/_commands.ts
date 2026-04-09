import { Command } from "effect/unstable/cli";

import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { listCommand } from "./list.js";
import { enableCommand } from "./enable.js";
import { disableCommand } from "./disable.js";
import { updateCommand } from "./update.js";
import { newCommand } from "./new.js";
import { publishCommand } from "./publish.js";

export const commandsCommand = Command.make("commands").pipe(
  Command.withDescription("Install and manage commands"),
  Command.withExamples([
    {
      command: "axm commands install @acme/commands/my-cmd",
      description: "Add a command from the registry",
    },
    {
      command: "axm commands list",
      description: "List installed commands",
    },
    {
      command: "axm commands enable my-cmd",
      description: "Enable a disabled command",
    },
    {
      command: "axm commands uninstall my-cmd",
      description: "Remove a command",
    },
    {
      command: "axm commands new my-cmd",
      description: "Scaffold a new command",
    },
    {
      command: "axm commands publish @acme/commands/my-cmd",
      description: "Publish a command to a registry",
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
  ]),
);
