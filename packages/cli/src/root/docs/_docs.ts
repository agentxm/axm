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

export const docsCommand = Command.make("docs").pipe(
  Command.withDescription("Manage docs packages"),
  Command.withExamples([
    {
      command: "axm docs install @acme/docs/workspace-baseline",
      description: "Install a docs package",
    },
  ]),
  Command.annotate(
    LearnMore,
    formatLearnMore([["axm docs install @acme/docs/workspace-baseline", "Install a docs package"]]),
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
