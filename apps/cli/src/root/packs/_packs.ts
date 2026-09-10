import { Command } from "effect/unstable/cli";

import { addCommand } from "./add.js";
import { disableCommand, enableCommand } from "./activation.js";
import { installCommand } from "./install/command.js";
import { listCommand } from "./list.js";
import { newCommand } from "./new.js";
import { packsPublishCommand as publishCommand } from "../publish/per-type-command.js";
import { removeCommand } from "./remove.js";
import { showCommand } from "./show.js";
import { uninstallCommand } from "./uninstall/command.js";
import { unpackCommand } from "./unpack/command.js";
import { updateCommand } from "./update.js";
import { LearnMore, formatLearnMore } from "../../formatter.js";
import { groupCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";

export const packsCommand = Command.make("packs").pipe(
  Command.withDescription("Manage packs"),
  withCommandCapabilities(groupCapabilities),
  Command.annotate(
    LearnMore,
    formatLearnMore([
      ["axm help packs", "Managing packs with AXM"],
      ["axm help pack-schema", "Print the pack manifest JSON Schema"],
    ]),
  ),
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
      command: "axm packs publish @acme/packs/frontend-tools",
      description: "Share your pack on the registry",
    },
  ]),
  Command.withSubcommands([
    listCommand,
    enableCommand,
    disableCommand,
    installCommand,
    uninstallCommand,
    newCommand,
    addCommand,
    removeCommand,
    showCommand,
    publishCommand,
    unpackCommand,
    updateCommand,
  ]),
);
