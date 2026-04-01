import { Argument, Command, Flag } from "effect/unstable/cli";

import { withRegistryRuntime, withWorkspace } from "../../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleUninstallPack } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";

const uninstallConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name or glob pattern of the pack to uninstall"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if extensions in this pack are used elsewhere"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, yes, force, preview }) =>
    handleUninstallPack({ name }, { yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRegistryRuntime({ command: "packs uninstall" }),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall a pack"),
  Command.withExamples([
    {
      command: "axm packs uninstall my-pack",
      description: "Remove a pack and its orphaned extensions",
    },
    {
      command: "axm packs uninstall my-pack --preview",
      description: "Check what would be removed first",
    },
    {
      command: "axm packs uninstall my-pack --yes",
      description: "Remove without confirmation (scripts/CI)",
    },
    {
      command: "axm packs uninstall acme-*",
      description: "Remove all packs matching a pattern",
    },
    {
      command: "",
      description: "See also: packs install",
    },
  ]),
);
