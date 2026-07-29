import { Command } from "effect/unstable/cli";
import { filesVersionCommand as versionCommand } from "../shared/version-command.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import { disableCommand } from "./disable.js";
import { enableCommand } from "./enable.js";
import { installCommand } from "./install/command.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { pruneCommand } from "./prune.js";
import { filesPublishCommand as publishCommand } from "../publish/per-type-command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { updateCommand } from "./update.js";

export const filesCommand = Command.make("files").pipe(
  Command.withDescription("Manage Context Files packages"),
  Command.withExamples([
    {
      command: "axm files install @acme/files/workspace-baseline",
      description: "Install a Context Files package",
    },
  ]),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help files", "Managing Context Files packages with AXM"],
      ["axm help files-schema", "Print the files manifest JSON Schema"],
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
    versionCommand,
    publishCommand,
    pruneCommand,
  ]),
);
