import { Command } from "effect/unstable/cli";

import { showHelpFor } from "../../help.js";
import { installCommand } from "./install.js";
import { uninstallCommand } from "./uninstall.js";

export const commandsCommand = Command.make("commands", {}, () =>
  showHelpFor(["axm", "commands"]),
).pipe(
  Command.withDescription("Install and manage commands"),
  Command.withExamples([
    {
      command: "axm commands install @acme/commands/my-cmd",
      description: "Install a command from the registry",
    },
    { command: "axm commands uninstall my-cmd", description: "Remove an installed command" },
  ]),
  Command.withSubcommands([installCommand, uninstallCommand]),
);
