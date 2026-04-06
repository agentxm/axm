import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../../command-meta.js";
import { handleUninstallPack } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
import { withWorkspace } from "../../../runtime.js";

const uninstallConfig = {
  name: Argument.string("name").pipe(
    Argument.withDescription("Name or glob pattern of the extension pack to uninstall"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if extensions in this extension pack are used elsewhere"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;
const commandMeta = registryCommandMeta("packs uninstall", { json: true });

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ name, yes, force, preview }) =>
    handleUninstallPack({ name }, { yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Uninstall an extension pack"),
  Command.withExamples([
    {
      command: "axm packs uninstall my-pack",
      description: "Remove an extension pack and its orphaned extensions",
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
      description: "Remove all extension packs matching a pattern",
    },
    {
      command: "",
      description: "See also: packs install",
    },
  ]),
);
