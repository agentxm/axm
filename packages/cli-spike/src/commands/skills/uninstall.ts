import * as Console from "effect/Console";
import { Argument, Command } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";

export const uninstallCommand = Command.make(
  "uninstall",
  {
    skill: Argument.string("skill").pipe(
      Argument.withDescription("Name of the skill to uninstall"),
    ),
    yes: yesFlag,
    preview: previewFlag,
  },
  (config) =>
    Console.log(
      `[stub] skills uninstall skill=${config.skill} yes=${config.yes} preview=${config.preview}`,
    ),
).pipe(
  Command.withDescription("Uninstall a skill from agents"),
  Command.withExamples([
    { command: "axm-spike skills uninstall my-skill", description: "Uninstall a skill" },
    {
      command: "axm-spike skills uninstall my-skill --preview",
      description: "Preview what would be uninstalled",
    },
    {
      command: "axm-spike skills uninstall my-skill --yes",
      description: "Uninstall without confirmation",
    },
  ]),
);
