import type { CommandModule } from "yargs";
import { confirmCommand } from "./confirm/command.js";
import { logCommand } from "./log/command.js";
import { multiselectCommand } from "./multiselect/command.js";
import { noteCommand } from "./note/command.js";
import { passwordInputCommand } from "./password-input/command.js";
import { selectCommand } from "./select/command.js";
import { spinnerCommand } from "./spinner/command.js";
import { textInputCommand } from "./text-input/command.js";

export const tuiCommand: CommandModule = {
  command: "tui",
  describe: "Demo TUI components",
  builder: (yargs) =>
    yargs
      .command(logCommand)
      .command(spinnerCommand)
      .command(noteCommand)
      .command(textInputCommand)
      .command(passwordInputCommand)
      .command(confirmCommand)
      .command(selectCommand)
      .command(multiselectCommand)
      .demandCommand(1, "Please specify a TUI component to demo"),
  handler: () => {},
};
