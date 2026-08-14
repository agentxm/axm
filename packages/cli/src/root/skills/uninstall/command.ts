import { Argument, Command, Flag } from "effect/unstable/cli";

import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { handleUninstall } from "./handler.js";
import { scopeFlag } from "../../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";

const uninstallConfig = {
  skill: Argument.string("skill").pipe(Argument.withDescription("Name of the skill to uninstall")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Uninstall from project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Skip the 'are you sure?' confirmation")),
  preview: previewFlag.pipe(
    Flag.withDescription("Show what would be removed without making changes"),
  ),
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ skill, scope, yes, preview }) =>
    handleUninstall({ skill }, { yes, preview }).pipe(
      withWorkspace(scope),
      withRuntime("skills uninstall"),
    ),
).pipe(
  withArgvTracking(uninstallConfig),
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
  ]),
);
