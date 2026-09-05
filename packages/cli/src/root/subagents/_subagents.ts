import { Command } from "effect/unstable/cli";
import { makeExtensionShowCommand } from "../shared/extension-show.js";

import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { listCommand } from "./list/command.js";
import { updateCommand } from "./update/command.js";
import { newCommand } from "./new/command.js";
import { publishCommand } from "./publish/command.js";
import { enableCommand } from "./enable/command.js";
import { disableCommand } from "./disable/command.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import { subagentsImportCommand as importCommand } from "../import/command.js";

const showCommand = makeExtensionShowCommand({
  type: "subagent",
  group: "subagents",
  exampleName: "researcher",
});

export const subagentsCommand = Command.make("subagents").pipe(
  Command.withDescription("Manage subagents"),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help subagents", "Managing subagents with AXM"],
      ["axm help subagent-schema", "Print the subagent manifest JSON Schema"],
    ]),
  ),
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
    showCommand,
    updateCommand,
    newCommand,
    importCommand,
    publishCommand,
    enableCommand,
    disableCommand,
  ]),
);
