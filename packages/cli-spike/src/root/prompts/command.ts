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
  Command.withDescription("Demo prompt components with explicit non-interactive paths"),
  Command.withExamples([
    {
      command: "axm-spike prompts text --value hello",
      description: "Bypass the text prompt with a flag value",
    },
    {
      command: "axm-spike prompts select --value red",
      description: "Resolve a select prompt without interactivity",
    },
    {
      command: "axm-spike prompts confirm --answer yes",
      description: "Drive the confirm prompt through a flag",
    },
  ]),
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
