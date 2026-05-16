import { Command } from "effect/unstable/cli";

import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { listCommand } from "./list.js";
import { updateCommand } from "./update/command.js";
import { newCommand } from "./new.js";
import { enableCommand } from "./enable.js";
import { disableCommand } from "./disable.js";
import { publishCommand } from "./publish.js";
import { pruneCommand } from "./prune/command.js";
import { skillsVersionCommand } from "../shared/version-command.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";

export const skillsCommand = Command.make("skills").pipe(
  Command.withDescription("Manage skills"),
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
    {
      command: "axm skills version @acme/skills/code-review patch",
      description: "Bump a skill version",
    },
  ]),
  Command.withSubcommands([
    installCommand,
    uninstallCommand,
    listCommand,
    updateCommand,
    newCommand,
    enableCommand,
    disableCommand,
    skillsVersionCommand,
    publishCommand,
    pruneCommand,
  ]),
);
