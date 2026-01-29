import type { CommandModule } from "yargs";
import { addCommand } from "./skills/add.js";

export const skillsCommand: CommandModule = {
  command: "skills",
  describe: "Manage skills (extensions) for AI coding agents",
  builder: (yargs) =>
    yargs
      .command(addCommand)
      .demandCommand(1, "Please specify a sub-command for skills")
      .example("$0 skills add owner/repo", "Add skills from a GitHub repository")
      .example("$0 skills add owner/repo@v1.0.0", "Add skills from a specific version")
      .example("$0 skills add ./local/path", "Add skills from a local directory")
      .example("$0 skills add https://example.com", "Add skills via well-known discovery"),
  handler: () => {
    // Handler won't run due to demandCommand(1)
  },
};
