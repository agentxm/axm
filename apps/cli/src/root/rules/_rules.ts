import { Command } from "effect/unstable/cli";
import { rulesPublishCommand as publishCommand } from "../publish/per-type-command.js";
import { groupCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { makeExtensionShowCommand } from "../shared/extension-show.js";

import { LearnMore, formatLearnMore } from "../../formatter.js";
import { disableCommand } from "./disable.js";
import { enableCommand } from "./enable.js";
import { installCommand } from "./install/command.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { uninstallCommand } from "./uninstall/command.js";
import { updateCommand } from "./update.js";

const showCommand = makeExtensionShowCommand({
  type: "rule",
  group: "rules",
  exampleName: "commit-style",
});

export const rulesCommand = Command.make("rules").pipe(
  Command.withDescription("Manage rules capabilities for configured agents"),
  withCommandCapabilities(groupCapabilities),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help rules", "Managing Rule extensions with AXM"],
      ["axm help rule-schema", "Print the rule manifest JSON Schema"],
    ]),
  ),
  Command.withExamples([{ command: "axm rules list", description: "Inventory detected rules" }]),
  Command.withSubcommands([
    newCommand,
    installCommand,
    uninstallCommand,
    listCommand,
    showCommand,
    enableCommand,
    disableCommand,
    updateCommand,
    publishCommand,
  ]),
);
