import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleRename } from "../../cli-commands/skills/rename/handler.js";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WORKSPACE_SCOPES,
  resolveWorkspaceScope,
} from "../../workspace/scope.js";

export const renameCommand = Command.make(
  "rename",
  {
    oldName: Argument.string("old-name").pipe(
      Argument.withDescription("Current name of the skill"),
    ),
    newName: Argument.string("new-name").pipe(Argument.withDescription("New name for the skill")),
    scope: Flag.choice("scope", WORKSPACE_SCOPES).pipe(
      Flag.withDescription("Configuration scope: project (default) or user"),
      Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ oldName, newName, scope, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        { scope: resolveWorkspaceScope(scope), agents: Option.none() },
        handleRename({ oldName, newName }),
      ),
      { command: "skills rename", flags: { yes, force, preview } },
    ),
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
