import { Command } from "effect/unstable/cli";

import { autocompleteCommand } from "./autocomplete.js";
import { autocompleteMultiselectCommand } from "./autocomplete-multiselect.js";
import { confirmCommand } from "./confirm.js";
import { groupMultiselectCommand } from "./group-multiselect.js";
import { multiselectCommand } from "./multiselect.js";
import { passwordCommand } from "./password.js";
import { pathCommand } from "./path.js";
import { selectCommand } from "./select.js";
import { selectKeyCommand } from "./select-key.js";
import { textCommand } from "./text.js";

export const promptsCommand = Command.make("prompts").pipe(
  Command.withDescription("Demo prompt components"),
  Command.withSubcommands([
    textCommand,
    passwordCommand,
    confirmCommand,
    pathCommand,
    selectCommand,
    multiselectCommand,
    groupMultiselectCommand,
    selectKeyCommand,
    autocompleteCommand,
    autocompleteMultiselectCommand,
  ]),
);
