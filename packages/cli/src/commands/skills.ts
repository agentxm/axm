import type { CommandModule } from "yargs";

export const skillsCommand: CommandModule = {
  command: "skills",
  describe: "Manage skills for AI coding agents",
  builder: (yargs) =>
    yargs
      .demandCommand(1, "Please specify a sub-command for skills")
      .example("$0 skills add owner/repo", "Add skills from a GitHub repository")
      .example("$0 skills add ./local/path", "Add skills from a local directory")
      .example("$0 skills add https://example.com", "Add skills from a well-known URL"),
  handler: () => {
    // Handler won't run due to demandCommand(1)
  },
};
