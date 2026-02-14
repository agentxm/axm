import type { CommandModule } from "yargs";
import { packsAddCommand } from "./add/command.js";
import { installPackCommand } from "./install/command.js";
import { packsNewCommand } from "./new/command.js";
import { publishPackCommand } from "./publish/command.js";
import { packsRemoveCommand } from "./remove/command.js";
import { uninstallPackCommand } from "./uninstall/command.js";
import { unpackCommand } from "./unpack/command.js";

export const packsCommand: CommandModule = {
  command: "packs",
  describe: "Manage extension packs for AI coding agents",
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
      .example("$0 packs add my-skill --pack my-pack", "Add a skill to a pack")
      .fail((msg, _err, yargs) => {
        if (msg?.includes("Not enough non-option arguments")) {
          yargs.showHelp("log");
          process.exit(0);
        }
        console.error(msg ?? _err);
        process.exit(1);
      }),
  handler: () => {},
};
