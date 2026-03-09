/**
 * Auth command group -- `axm auth` with login, logout, whoami, token subcommands.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import { subcommandFailHandler } from "../yargs-helpers.js";
import { loginCommand } from "./login/command.js";
import { logoutCommand } from "./logout/command.js";
import { whoamiCommand } from "./whoami/command.js";
import { tokenCommand } from "./token/command.js";

export const authCommand: CommandModule = {
  command: "auth",
  describe: "Manage authentication",
  builder: (yargs) =>
    yargs
      .command(loginCommand)
      .command(logoutCommand)
      .command(whoamiCommand)
      .command(tokenCommand)
      .demandCommand(1)
      .fail(subcommandFailHandler),
  handler: () => {},
};
