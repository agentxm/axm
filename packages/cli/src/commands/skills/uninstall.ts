import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleUninstall } from "../../cli-commands/skills/uninstall/handler.js";
import { DEFAULT_WORKSPACE_SCOPE } from "../../workspace/scope.js";

const uninstallConfig = {
  skill: Argument.string("skill").pipe(
    Argument.withDescription("Name of the skill to uninstall"),
  ),
  yes: yesFlag,
  force: forceFlag,
  preview: previewFlag,
} as const;

export const uninstallCommand = Command.make(
  "uninstall",
  uninstallConfig,
  ({ skill, yes, force, preview }) =>
    withRuntime(withWorkspace(DEFAULT_WORKSPACE_SCOPE, handleUninstall({ skill })), {
      command: "skills uninstall",
      flags: { yes, force, preview },
    }),
).pipe(
  withArgvTracking(uninstallConfig),
  Command.withDescription("Uninstall a skill from agents"),
  Command.withExamples([
    { command: "axm skills uninstall my-skill", description: "Uninstall a skill" },
    {
      command: "axm skills uninstall my-skill --preview",
      description: "Preview what would be uninstalled",
    },
    {
      command: "axm skills uninstall my-skill --yes",
      description: "Uninstall without confirmation prompt",
    },
  ]),
);
