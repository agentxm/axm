import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleUninstallPack } from "../../cli-commands/packs/uninstall/handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "../../workspace/scope.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name or glob pattern of the pack to uninstall"),
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        DEFAULT_WORKSPACE_SCOPE,
        handleUninstallPack({ name }, { yes, force, preview }),
      ),
      { command: "packs uninstall" },
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall a pack"),
  Command.withExamples([
    {
      command: "axm packs uninstall my-pack",
      description: "Uninstall a pack and its orphaned extensions",
    },
    {
      command: "axm packs uninstall my-pack --preview",
      description: "Preview what would be uninstalled",
    },
    {
      command: "axm packs uninstall my-pack --yes",
      description: "Uninstall without confirmation prompt",
    },
    {
      command: "axm packs uninstall acme-*",
      description: "Uninstall all packs matching a pattern",
    },
  ]),
);
