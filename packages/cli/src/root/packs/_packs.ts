import { Command } from "effect/unstable/cli";

import { packsVersionCommand } from "../shared/version-command.js";
import { addCommand } from "./add.js";
import { installCommand } from "./install/command.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { publishCommand } from "./publish.js";
import { removeCommand } from "./remove.js";
import { uninstallCommand } from "./uninstall/command.js";
import { unpackCommand } from "./unpack/command.js";

export const packsCommand = Command.make("packs").pipe(
  Command.withDescription("Manage packs"),
  Command.withExamples([
    {
      command: "axm packs install @acme/packs/frontend-tools",
      description: "Add a curated set of extensions to your agents",
    },
    {
      command: "axm packs new my-pack",
      description: "Create a new pack to bundle your extensions",
    },
    {
      command: "axm packs add my-pack @acme/skills/code-review",
      description: "Add extensions to your pack",
    },
    {
      command: "axm packs publish @acme/frontend-tools",
      description: "Share your pack on the registry",
    },
    {
      command: "axm packs version @acme/packs/frontend-tools patch",
      description: "Bump a pack version",
    },
  ]),
  Command.withSubcommands([
    listCommand,
    installCommand,
    uninstallCommand,
    newCommand,
    addCommand,
    removeCommand,
    publishCommand,
    unpackCommand,
    packsVersionCommand,
  ]),
);
