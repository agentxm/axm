import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, scopeFlag, yesFlag } from "../../cli-flags/index.js";
import { handleRename } from "../../cli-commands/skills/rename/handler.js";

export const renameCommand = Command.make(
  "rename",
  {
    oldName: Argument.string("old-name").pipe(
      Argument.withDescription("Current name of the skill"),
    ),
    newName: Argument.string("new-name").pipe(Argument.withDescription("New name for the skill")),
    scope: scopeFlag,
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ oldName, newName, scope, yes, force, preview }) =>
    withRuntime(withWorkspace(scope, handleRename({ oldName, newName })), {
      command: "skills rename",
      flags: { yes, force, preview },
    }),
).pipe(
  Command.withDescription("Rename a skill"),
  Command.withExamples([
    { command: "axm skills rename old-name new-name", description: "Rename a skill" },
    {
      command: "axm skills rename old-name new-name --preview",
      description: "Preview what would be renamed",
    },
  ]),
);
