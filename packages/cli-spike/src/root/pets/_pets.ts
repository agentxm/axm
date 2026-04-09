import { Command } from "effect/unstable/cli";

import { adoptCommand } from "./adopt.js";
import { intakeCommand } from "./intake.js";
import { listCommand } from "./list.js";
import { registerCommand } from "./register.js";

export const petsCommand = Command.make("pets").pipe(
  Command.withDescription("List, intake, register, and adopt sample pets"),
  Command.withExamples([
    { command: "axm-spike pets list", description: "Inspect the sample pet catalog" },
    {
      command: "axm-spike pets intake partner-feed --all --yes",
      description: "Intake every sample pet from a feed without prompting",
    },
    {
      command: "axm-spike pets register Mochi --tag shy",
      description: "Register a sample pet with tags",
    },
    {
      command: "axm-spike pets adopt Mochi --preview",
      description: "Preview an adoption plan before applying it",
    },
  ]),
  Command.withSubcommands([listCommand, intakeCommand, registerCommand, adoptCommand]),
);
