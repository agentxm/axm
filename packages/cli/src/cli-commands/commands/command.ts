import type { CommandModule } from "yargs";
import { subcommandFailHandler } from "../yargs-helpers.js";
import { installCommandCommand } from "./install/command.js";
import { uninstallCommandCommand } from "./uninstall/command.js";

export const commandsCommand: CommandModule = {
  command: "commands",
  describe: "Install and manage commands",
  builder: (yargs) =>
    yargs
      .command(installCommandCommand)
      .command(uninstallCommandCommand)
      .demandCommand(1)
      .example("$0 commands install @acme/commands/my-cmd", "Install a command from registry")
      .example("$0 commands uninstall my-cmd", "Uninstall a command")
      .fail(subcommandFailHandler),
  handler: () => {},
};
