import { Command } from "effect/unstable/cli";

import { showHelpFor } from "../../help.js";
import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { listCommand } from "./list/command.js";
import { newCommand } from "./new/command.js";
import { forkCommand } from "./fork/command.js";
import { publishCommand } from "./publish/command.js";
import { updateCommand } from "./update/command.js";
import { enableCommand } from "./enable/command.js";
import { disableCommand } from "./disable/command.js";
import { renameCommand } from "./rename/command.js";

export const skillsCommand = Command.make("skills", {}, () => showHelpFor(["axm", "skills"])).pipe(
  Command.withDescription("Install, update, and manage skills"),
  Command.withExamples([
    {
      command: "axm skills install owner/repo",
      description: "Install skills from a GitHub repository",
    },
    {
      command: "axm skills install owner/repo@v1.0.0",
      description: "Install skills from a specific version",
    },
    {
      command: "axm skills install ./local/path",
      description: "Install skills from a local directory",
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
