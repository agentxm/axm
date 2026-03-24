import { Command } from "effect/unstable/cli";

import { showHelpFor } from "../../help.js";
import { addCommand } from "./add.js";
import { installCommand } from "./install.js";
import { newCommand } from "./new.js";
import { publishCommand } from "./publish.js";
import { removeCommand } from "./remove.js";
import { uninstallCommand } from "./uninstall.js";
import { unpackCommand } from "./unpack.js";

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
