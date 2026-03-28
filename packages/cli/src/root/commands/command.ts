import { Command } from "effect/unstable/cli";

import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";

export const commandsCommand = Command.make("commands").pipe(
  Command.withDescription("Install and manage commands"),
  Command.withExamples([
    {
      command: "axm commands install @acme/commands/my-cmd",
      description: "Add a command from the registry",
    },
    {
      command: "axm commands uninstall my-cmd",
      description: "Remove a command",
    },
  ]),
  Command.withSubcommands([installCommand, uninstallCommand]),
);
