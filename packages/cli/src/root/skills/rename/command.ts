import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { scopeFlag } from "../../../cli-flags/index.js";
import { handleRename } from "./handler.js";

const renameConfig = {
  oldName: Argument.string("old-name").pipe(Argument.withDescription("Current name of the skill")),
  newName: Argument.string("new-name").pipe(Argument.withDescription("New name for the skill")),
  scope: scopeFlag,
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const renameCommand = Command.make(
  "rename",
  renameConfig,
  ({ oldName, newName, scope, yes, force, preview }) =>
    withRuntime(withWorkspace(scope, handleRename({ oldName, newName, yes, force, preview })), {
      command: "skills rename",
    }),
).pipe(
  withArgvTracking(renameConfig),
  Command.withDescription("Rename a skill"),
  Command.withExamples([
    { command: "axm skills rename old-name new-name", description: "Rename a skill" },
    {
      command: "axm skills rename old-name new-name --preview",
      description: "Preview what would be renamed",
    },
  ]),
);
