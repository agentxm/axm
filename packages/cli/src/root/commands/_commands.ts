import { Command } from "effect/unstable/cli";

import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { listCommand } from "./list.js";
import { enableCommand } from "./enable.js";
import { disableCommand } from "./disable.js";
import { updateCommand } from "./update.js";
import { newCommand } from "./new.js";
import { commandsPublishCommand as publishCommand } from "../publish/per-type-command.js";
import { commandsVersionCommand } from "../shared/version-command.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";

export const commandsCommand = Command.make("commands").pipe(
  Command.withDescription("Manage commands"),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help commands", "Managing command extensions with AXM"],
      ["axm help command-schema", "Print the command manifest JSON Schema"],
    ]),
  ),
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
    {
      command: "axm commands version @acme/commands/my-cmd patch",
      description: "Bump a command version",
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
    commandsVersionCommand,
    publishCommand,
  ]),
);
