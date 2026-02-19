import type { CommandModule } from "yargs";
import { subcommandFailHandler } from "../yargs-helpers.js";
import { packsAddCommand } from "./add/command.js";
import { installPackCommand } from "./install/command.js";
import { packsNewCommand } from "./new/command.js";
import { publishPackCommand } from "./publish/command.js";
import { packsRemoveCommand } from "./remove/command.js";
import { uninstallPackCommand } from "./uninstall/command.js";
import { unpackCommand } from "./unpack/command.js";

export const packsCommand: CommandModule = {
  command: "packs",
  describe: "Bundle and manage extension packs",
  builder: (yargs) =>
    yargs
      .command(packsNewCommand)
      .command(installPackCommand)
      .command(uninstallPackCommand)
      .command(packsAddCommand)
      .command(packsRemoveCommand)
      .command(publishPackCommand)
      .command(unpackCommand)
      .demandCommand(1)
      .example("$0 packs new my-pack", "Create a new extension pack")
      .example("$0 packs install owner/repo", "Install an extension pack")
      .example("$0 packs add my-pack @acme/skills/code-review", "Add an extension to a pack")
      .fail(subcommandFailHandler),
  handler: () => {},
};
