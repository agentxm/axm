import type { CommandModule } from "yargs";

export const extensionsCommand: CommandModule = {
  command: "extensions",
  describe: "Manage extensions",
  builder: (yargs) =>
    yargs
      .demandCommand(1, "Please specify a sub-command for extensions")
      .example("$0 extensions list", "List installed extensions")
      .example("$0 extensions add <name>", "Add an extension"),
  handler: () => {
    // Handler won't run due to demandCommand(1)
  },
};
