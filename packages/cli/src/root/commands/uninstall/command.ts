import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { handleUninstallCommand } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@agentxm/client-core/unstable/workspace";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import * as Effect from "effect/Effect";
import {
  deleteSourceFlag,
  keepSourceFlag,
  resolveSourceDisposition,
} from "../../shared/source-disposition-flags.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the command to uninstall")),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if the command is referenced by other extensions"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
  keepSource: keepSourceFlag,
  deleteSource: deleteSourceFlag,
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, yes, force, preview, keepSource, deleteSource }) =>
    Effect.gen(function* () {
      const sourceDisposition = yield* resolveSourceDisposition(keepSource, deleteSource);
      yield* handleUninstallCommand(
        { commandName: name },
        { yes, force, preview, ...(sourceDisposition === undefined ? {} : { sourceDisposition }) },
      );
    }).pipe(withWorkspace(DEFAULT_WORKSPACE_SCOPE), withRuntime("commands uninstall")),
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
  ]),
);
