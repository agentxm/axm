import type { CommandModule } from "yargs";
import { addCommand } from "./skills/add.js";

export const skillsCommand: CommandModule = {
  command: "skills",
  describe: "Manage skills (extensions) for AI coding agents",
  builder: (yargs) =>
    yargs
      .command(addCommand)
      .demandCommand(1)
      .example("$0 skills add owner/repo", "Add skills from a GitHub repository")
      .example("$0 skills add owner/repo@v1.0.0", "Add skills from a specific version")
      .example("$0 skills add ./local/path", "Add skills from a local directory")
      .example("$0 skills add https://example.com", "Add skills via well-known discovery")
      .fail((msg, err, yargs) => {
        if (msg?.includes("Not enough non-option arguments")) {
          yargs.showHelp();
          process.exit(0);
        }
        console.error(msg);
        process.exit(1);
      }),
  handler: () => {},
};
