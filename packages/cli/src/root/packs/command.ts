import { Command } from "effect/unstable/cli";

import { addCommand } from "./add.js";
import { installCommand } from "./install/command.js";
import { newCommand } from "./new.js";
import { publishCommand } from "./publish.js";
import { removeCommand } from "./remove.js";
import { uninstallCommand } from "./uninstall/command.js";
import { unpackCommand } from "./unpack/command.js";

export const packsCommand = Command.make("packs").pipe(
  Command.withDescription("Bundle and manage extension packs"),
  Command.withExamples([
    {
      command: "axm packs install @acme/packs/frontend-tools",
      description: "Install an extension pack from the registry",
    },
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
