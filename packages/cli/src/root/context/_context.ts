import { Command } from "effect/unstable/cli";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import { disableCommand } from "./disable.js";
import { enableCommand } from "./enable.js";
import { installCommand } from "./install/command.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { pruneCommand } from "./prune.js";
import { publishCommand } from "./publish.js";
import { uninstallCommand } from "./uninstall/command.js";
import { updateCommand } from "./update.js";

export const contextCommand = Command.make("context").pipe(
  Command.withDescription("Manage context packages"),
  Command.withExamples([
    {
      command: "axm context install @acme/context/workspace-baseline",
      description: "Install a context package",
    },
  ]),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm context install @acme/context/workspace-baseline", "Install a context package"],
    ]),
  ),
  Command.withSubcommands([
    installCommand,
    uninstallCommand,
    listCommand,
    enableCommand,
    disableCommand,
    updateCommand,
    newCommand,
    publishCommand,
    pruneCommand,
  ]),
);
