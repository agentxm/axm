import { Command } from "effect/unstable/cli";
import { groupCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { makeExtensionShowCommand } from "../shared/extension-show.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import { disableCommand } from "./disable.js";
import { enableCommand } from "./enable.js";
import { installCommand } from "./install/command.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { hooksPublishCommand as publishCommand } from "../publish/per-type-command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { updateCommand } from "./update.js";

const showCommand = makeExtensionShowCommand({
  type: "hook",
  group: "hooks",
  exampleName: "workspace-baseline",
});

export const hooksCommand = Command.make("hooks").pipe(
  Command.withDescription("Manage hook extensions"),
  withCommandCapabilities(groupCapabilities),
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
    listCommand,
    showCommand,
    enableCommand,
    disableCommand,
    updateCommand,
    publishCommand,
  ]),
);
