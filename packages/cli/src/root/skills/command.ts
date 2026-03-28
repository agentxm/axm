import { Command } from "effect/unstable/cli";

import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { forkCommand } from "./fork.js";
import { publishCommand } from "./publish.js";
import { updateCommand } from "./update/command.js";
import { enableCommand } from "./enable.js";
import { disableCommand } from "./disable.js";
import { renameCommand } from "./rename.js";

export const skillsCommand = Command.make("skills").pipe(
  Command.withDescription("Install, update, and manage skills"),
  Command.withExamples([
    {
      command: "axm skills install @acme/skills/code-review",
      description: "Install a skill from the registry",
    },
    {
      command: "axm skills install @acme/skills/code-review@^1.0.0",
      description: "Install a specific version from the registry",
    },
    {
      command: "axm skills install owner/repo",
      description: "Install skills from a GitHub repository",
    },
    { command: "axm skills list", description: "List installed skills" },
  ]),
  Command.withSubcommands([
    installCommand,
    uninstallCommand,
    listCommand,
    newCommand,
    forkCommand,
    publishCommand,
    updateCommand,
    enableCommand,
    disableCommand,
    renameCommand,
  ]),
);
