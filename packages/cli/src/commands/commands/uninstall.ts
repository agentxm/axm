import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleUninstallCommand } from "../../cli-commands/commands/uninstall/handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "../../workspace/scope.js";

export const uninstallCommand = Command.make(
  "uninstall",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name of the command to uninstall"),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ name, yes, force, preview }) =>
    withRuntime(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE, handleUninstallCommand({ commandName: name })),
      { command: "commands uninstall", flags: { yes, force, preview } },
    ),
).pipe(Command.withDescription("Uninstall a command"));
