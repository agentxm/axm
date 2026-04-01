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
  skill: Argument.string("skill").pipe(Argument.withDescription("Name of the skill to uninstall")),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Remove even if other extensions depend on this skill"),
  ),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;
const commandMeta = registryCommandMeta("skills uninstall", { json: true });

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ skill, yes, force, preview }) =>
    handleUninstall({ skill }, { yes, force, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withCommandRuntime(commandMeta),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription("Uninstall a skill from agents"),
  Command.withExamples([
    { command: "axm skills uninstall my-skill", description: "Remove a skill you no longer need" },
    {
      command: "axm skills uninstall my-skill --preview",
      description: "Check what would be removed first",
    },
    {
      command: "axm skills uninstall my-skill --yes",
      description: "Remove without confirmation (scripts/CI)",
    },
    { command: "", description: "See also: skills install, skills disable, skills list" },
  ]),
);
