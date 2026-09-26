import { Command } from "effect/unstable/cli";
import { makeExtensionShowCommand } from "../shared/extension-show.js";
import { groupCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";

import { skillsInstallCommand as installCommand } from "../install/command.js";
import { makePerTypeUninstallCommand } from "../shared/uninstall-command.js";
import { listCommand } from "./list.js";
import { makePerTypeUpdateCommand } from "../update/per-type-command.js";
import { newCommand } from "./new.js";
import { makeActivationCommands } from "../activation-handler.js";
import { skillsPublishCommand as publishCommand } from "../publish/per-type-command.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import { skillsImportCommand as importCommand } from "../import/command.js";

const updateCommand = makePerTypeUpdateCommand("skill");

const uninstallCommand = makePerTypeUninstallCommand("skill");

const { enableCommand, disableCommand } = makeActivationCommands("skill");

const showCommand = makeExtensionShowCommand({
  type: "skill",
  group: "skills",
  exampleName: "code-review",
});

export const skillsCommand = Command.make("skills").pipe(
  Command.withDescription("Manage skills"),
  withCommandCapabilities(groupCapabilities),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help skills", "Managing agent skills with AXM"],
      ["axm help skill-schema", "Print the skill manifest JSON Schema"],
    ]),
  ),
  Command.withExamples([
    {
      command: "axm skills install @acme/skills/code-review",
      description: "Add a code review skill to your agents",
    },
    {
      command: "axm skills install @acme/skills/code-review@^1.0.0",
      description: "Pin to a specific version range",
    },
    {
      command: "axm skills install owner/repo",
      description: "Install from a GitHub repository",
    },
    { command: "axm skills list", description: "See what skills are installed" },
  ]),
  Command.withSubcommands([
    installCommand,
    uninstallCommand,
    listCommand,
    showCommand,
    updateCommand,
    newCommand,
    importCommand,
    enableCommand,
    disableCommand,
    publishCommand,
  ]),
);
