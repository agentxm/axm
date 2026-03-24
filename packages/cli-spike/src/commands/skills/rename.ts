import * as Console from "effect/Console";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";

export const renameCommand = Command.make(
  "rename",
  {
    oldName: Argument.string("old-name").pipe(
      Argument.withDescription("Current name of the skill"),
    ),
    newName: Argument.string("new-name").pipe(Argument.withDescription("New name for the skill")),
    scope: Flag.choice("scope", ["project", "user"] as const).pipe(
      Flag.withDescription("Configuration scope"),
      Flag.withDefault("project" as const),
    ),
    yes: yesFlag,
    preview: previewFlag,
  },
  (config) =>
    Console.log(
      `[stub] skills rename ${config.oldName} -> ${config.newName} scope=${config.scope} yes=${config.yes} preview=${config.preview}`,
    ),
).pipe(
  Command.withDescription("Rename a skill"),
  Command.withExamples([
    { command: "axm-spike skills rename old-name new-name", description: "Rename a skill" },
    {
      command: "axm-spike skills rename old-name new-name --preview",
      description: "Preview the rename",
    },
    {
      command: "axm-spike skills rename old-name new-name --yes",
      description: "Rename without confirmation",
    },
  ]),
);
