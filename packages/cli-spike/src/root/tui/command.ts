import { Command } from "effect/unstable/cli";

import { confirmCommand } from "./confirm.js";
import { logCommand } from "./log.js";
import { multiselectCommand } from "./multiselect.js";
import { noteCommand } from "./note.js";
import { passwordInputCommand } from "./password-input.js";
import { selectCommand } from "./select.js";
import { spinnerCommand } from "./spinner.js";
import { textInputCommand } from "./text-input.js";

export const tuiCommand = Command.make("tui").pipe(
  Command.withDescription("Demo TUI components"),
  Command.withSubcommands([
    logCommand,
    spinnerCommand,
    noteCommand,
    textInputCommand,
    passwordInputCommand,
    confirmCommand,
    selectCommand,
    multiselectCommand,
  ]),
);
