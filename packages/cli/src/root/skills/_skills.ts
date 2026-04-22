import { Command } from "effect/unstable/cli";

import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { listCommand } from "./list.js";
import { updateCommand } from "./update/command.js";
import { newCommand } from "./new.js";
import { forkCommand } from "./fork.js";
import { enableCommand } from "./enable.js";
import { disableCommand } from "./disable.js";
import { renameCommand } from "./rename.js";
import { publishCommand } from "./publish.js";
import { pruneCommand } from "./prune/command.js";

export const skillsCommand = Command.make("skills").pipe(
  Command.withDescription("Install, update, and manage skills"),
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
    updateCommand,
    newCommand,
    forkCommand,
    enableCommand,
    disableCommand,
    renameCommand,
    publishCommand,
    pruneCommand,
  ]),
);
