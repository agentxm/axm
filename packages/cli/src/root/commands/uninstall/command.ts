import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleUninstallCommand } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";

const uninstallConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the command to uninstall")),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if the command is referenced by other extensions"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        DEFAULT_WORKSPACE_SCOPE,
        handleUninstallCommand({ commandName: name }, { yes, force, preview }),
      ),
      { command: "commands uninstall" },
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall a command"),
  Command.withExamples([
    {
      command: "axm commands uninstall my-cmd",
      description: "Remove a command you no longer need",
    },
    {
      command: "axm commands uninstall my-cmd --preview",
      description: "Check what would be removed first",
    },
    {
      command: "axm commands uninstall my-cmd --yes",
      description: "Remove without confirmation (scripts/CI)",
    },
    { command: "", description: "See also: commands install" },
  ]),
);
