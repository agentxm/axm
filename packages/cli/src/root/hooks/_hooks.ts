import { Command } from "effect/unstable/cli";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import { disableCommand } from "./disable.js";
import { enableCommand } from "./enable.js";
import { infoCommand } from "./info.js";
import { installCommand } from "./install/command.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { pruneCommand } from "./prune.js";
import { hooksPublishCommand as publishCommand } from "../publish/per-type-command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { updateCommand } from "./update.js";

export const hooksCommand = Command.make("hooks").pipe(
  Command.withDescription("Manage hook extensions"),
  Command.withExamples([
    {
      command: "axm hooks install @acme/hooks/workspace-baseline",
      description: "Install a hook extension",
    },
  ]),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help hooks", "Managing hook extensions with AXM"],
      ["axm help hook-schema", "Print the hook manifest JSON Schema"],
    ]),
  ),
  Command.withSubcommands([
    newCommand,
    installCommand,
    uninstallCommand,
    infoCommand,
    listCommand,
    enableCommand,
    disableCommand,
    updateCommand,
    publishCommand,
    pruneCommand,
  ]),
);
