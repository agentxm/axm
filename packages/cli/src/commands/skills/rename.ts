import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
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
  },
  ({ oldName, newName, scope }) =>
    withCommandRuntime(handleRename({ oldName, newName }), {
      command: "skills rename",
      workspace: { scope: resolveWorkspaceScope(scope), agents: Option.none() },
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
