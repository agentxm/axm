import { Command } from "effect/unstable/cli";

import { autocompleteCommand } from "./autocomplete.js";
import { autocompleteMultiselectCommand } from "./autocomplete-multiselect.js";
import { compositionCommand } from "./composition.js";
import { confirmCommand } from "./confirm.js";
import { dateCommand } from "./date.js";
import { groupMultiselectCommand } from "./group-multiselect.js";
import { hiddenCommand } from "./hidden.js";
import { integerCommand } from "./integer.js";
import { listCommand } from "./list.js";
import { multiselectCommand } from "./multiselect.js";
import { passwordCommand } from "./password.js";
import { pathCommand } from "./path.js";
import { selectCommand } from "./select.js";
import { selectKeyCommand } from "./select-key.js";
import { textCommand } from "./text.js";
import { toggleCommand } from "./toggle.js";

export const promptsCommand = Command.make("prompts").pipe(
  Command.withDescription("Demo prompt components with explicit non-interactive paths"),
  Command.withExamples([
    {
      command: "axm-spike prompts text --value Mochi",
      description: "Bypass the text prompt with a flag value",
    },
    {
      command: "axm-spike prompts select --value cat",
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
    integerCommand,
    dateCommand,
    toggleCommand,
    listCommand,
    hiddenCommand,
    compositionCommand,
  ]),
);
