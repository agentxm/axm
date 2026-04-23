import { Command } from "effect/unstable/cli";

import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { listCommand } from "./list/command.js";
import { updateCommand } from "./update/command.js";
import { newCommand } from "./new/command.js";
import { publishCommand } from "./publish/command.js";
import { enableCommand } from "./enable/command.js";
import { disableCommand } from "./disable/command.js";
import { renameCommand } from "./rename/command.js";

export const subagentsCommand = Command.make("subagents").pipe(
  Command.withDescription("Manage subagents"),
  Command.withExamples([
    {
      command: "axm subagents install @acme/subagents/researcher",
      description: "Add a subagent from the registry",
    },
    {
      command: "axm subagents list",
      description: "See what subagents are installed",
    },
  ]),
  Command.withSubcommands([
    installCommand,
    uninstallCommand,
    listCommand,
    updateCommand,
    newCommand,
    publishCommand,
    enableCommand,
    disableCommand,
    renameCommand,
  ]),
);
