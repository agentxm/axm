import type { CommandModule } from "yargs";
import { installCommand } from "./install/command.js";
import { uninstallCommand } from "./uninstall/command.js";

export const skillsCommand: CommandModule = {
  command: "skills",
  describe: "Manage skills (extensions) for AI coding agents",
  builder: (yargs) =>
    yargs
      .command(installCommand)
      .command(uninstallCommand)
      .demandCommand(1)
      .example("$0 skills install owner/repo", "Install skills from a GitHub repository")
      .example("$0 skills install owner/repo@v1.0.0", "Install skills from a specific version")
      .example("$0 skills install ./local/path", "Install skills from a local directory")
      .example("$0 skills install https://example.com", "Install skills via well-known discovery")
      .fail((msg, _err, yargs) => {
        if (msg?.includes("Not enough non-option arguments")) {
          yargs.showHelp("log");
          process.exit(0);
        }
        console.error(msg);
        process.exit(1);
      }),
  handler: () => {},
};
