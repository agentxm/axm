import { Command } from "effect/unstable/cli";

import { LearnMore, formatLearnMore } from "../../formatter.js";
import { knowledgePublishCommand as publishCommand } from "../publish/per-type-command.js";
import { groupCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { makeExtensionShowCommand } from "../shared/extension-show.js";
import { disableCommand } from "./disable.js";
import { enableCommand } from "./enable.js";
import { installCommand } from "./install/command.js";
import { lintCommand } from "./lint.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { conceptsCommand } from "./concepts/_concepts.js";
import { uninstallCommand } from "./uninstall/command.js";
import { updateCommand } from "./update.js";

const showCommand = makeExtensionShowCommand({
  type: "knowledge",
  group: "knowledge",
  exampleName: "platform",
});

export const knowledgeCommand = Command.make("knowledge").pipe(
  Command.withDescription("Browse and validate Open Knowledge Format bundles"),
  withCommandCapabilities(groupCapabilities),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help knowledge", "How knowledge bundles work"],
      ["axm help knowledge-schema", "Print the knowledge manifest JSON Schema"],
      ["axm help package-extensions", "How AXM links registry extensions to packages"],
    ]),
  ),
  Command.withExamples([
    { command: "axm knowledge list", description: "List installed knowledge bundles" },
    {
      command: 'axm knowledge concepts search "authentication"',
      description: "Search installed knowledge concepts",
    },
  ]),
  Command.withSubcommands([
    newCommand,
    installCommand,
    updateCommand,
    uninstallCommand,
    listCommand,
    showCommand,
    conceptsCommand,
    lintCommand,
    enableCommand,
    disableCommand,
    publishCommand,
  ]),
);
