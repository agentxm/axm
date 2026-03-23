import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handleUninstallCommand } from "../../cli-commands/commands/uninstall/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const uninstallCommand = Command.make(
  "uninstall",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name of the command to uninstall"),
    ),
  },
  ({ name }) =>
    withCommandRuntime(handleUninstallCommand({ commandName: name }), {
      command: "commands uninstall",
      workspace: { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
    }),
).pipe(Command.withDescription("Uninstall a command"));
