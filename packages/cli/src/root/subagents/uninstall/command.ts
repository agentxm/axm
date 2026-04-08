import { Argument, Command, Flag } from "effect/unstable/cli";

import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import {
  annotateCommandMeta,
  registryCommandMeta,
  withCommandRuntime,
} from "../../../command-meta.js";
import { handleUninstall } from "./handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "@axm.sh/core/unstable/workspace";
import { withWorkspace } from "../../../runtime.js";

const uninstallConfig = {
  subagent: Argument.string("subagent").pipe(
    Argument.withDescription("Name of the subagent to uninstall"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if other extensions depend on this subagent"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;
const commandMeta = registryCommandMeta("subagents uninstall", { json: true });

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ subagent, yes, force, preview }) =>
    handleUninstall({ subagent }, { yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Uninstall a subagent from agents"),
  Command.withExamples([
    {
      command: "axm subagents uninstall my-subagent",
      description: "Remove a subagent you no longer need",
    },
    {
      command: "axm subagents uninstall my-subagent --preview",
      description: "Check what would be removed first",
    },
    {
      command: "axm subagents uninstall my-subagent --yes",
      description: "Remove without confirmation (scripts/CI)",
    },
    {
      command: "",
      description: "See also: subagents install, subagents list",
    },
  ]),
);
