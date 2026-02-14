import type { CommandModule } from "yargs";
import { disableCommand } from "./disable/command.js";
import { enableCommand } from "./enable/command.js";
import { forkCommand } from "./fork/command.js";
import { installCommand } from "./install/command.js";
import { listCommand } from "./list/command.js";
import { publishCommand } from "./publish/command.js";
import { renameCommand } from "./rename/command.js";
import { uninstallCommand } from "./uninstall/command.js";
import { updateCommand } from "./update/command.js";

export const skillsCommand: CommandModule = {
  command: "skills",
  describe: "Install, update, and manage skills",
  builder: (yargs) =>
    yargs
      .command(installCommand)
      .command(uninstallCommand)
      .command(listCommand)
      .command(forkCommand)
      .command(publishCommand)
      .command(updateCommand)
      .command(enableCommand)
      .command(disableCommand)
      .command(renameCommand)
      .demandCommand(1)
      .example("$0 skills install owner/repo", "Install skills from a GitHub repository")
      .example("$0 skills install owner/repo@v1.0.0", "Install skills from a specific version")
      .example("$0 skills install ./local/path", "Install skills from a local directory")
      .example("$0 skills list", "List installed skills")
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
