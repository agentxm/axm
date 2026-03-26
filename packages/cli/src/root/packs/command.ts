import { Command } from "effect/unstable/cli";

import { showHelpFor } from "../../help.js";
import { addCommand } from "./add/command.js";
import { installCommand } from "./install/command.js";
import { newCommand } from "./new/command.js";
import { publishCommand } from "./publish/command.js";
import { removeCommand } from "./remove/command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { unpackCommand } from "./unpack/command.js";

export const packsCommand = Command.make("packs", {}, () => showHelpFor(["axm", "packs"])).pipe(
  Command.withDescription("Bundle and manage extension packs"),
  Command.withExamples([
    { command: "axm packs install owner/repo", description: "Install an extension pack" },
    { command: "axm packs new my-pack", description: "Create a new extension pack" },
  ]),
  Command.withSubcommands([
    addCommand,
    installCommand,
    newCommand,
    publishCommand,
    removeCommand,
    uninstallCommand,
    unpackCommand,
  ]),
);
