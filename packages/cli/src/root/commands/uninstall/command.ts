import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../../command-meta.js";
import { handleUninstallCommand } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
import { withWorkspace } from "../../../runtime.js";

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
const commandMeta = registryCommandMeta("commands uninstall", { json: true });

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, yes, force, preview }) =>
    handleUninstallCommand({ commandName: name }, { yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  annotateCommandMeta(commandMeta),
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
