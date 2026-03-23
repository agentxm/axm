import { Command } from "effect/unstable/cli";

import { disableCommand } from "./disable.js";
import { enableCommand } from "./enable.js";
import { forkCommand } from "./fork.js";
import { installCommand } from "./install.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { publishCommand } from "./publish.js";
import { renameCommand } from "./rename.js";
import { uninstallCommand } from "./uninstall.js";
import { updateCommand } from "./update.js";

export const skillsCommand = Command.make("skills").pipe(
  Command.withDescription("Install, update, and manage skills"),
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
