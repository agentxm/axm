import * as Option from "effect/Option";
import { Argument, Command } from "effect/unstable/cli";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { forceFlag, previewFlag, yesFlag } from "../../cli-flags/index.js";
import { handleUninstall } from "../../cli-commands/skills/uninstall/handler.js";
import { DEFAULT_WORKSPACE_SCOPE, resolveWorkspaceScope } from "../../workspace/scope.js";

export const uninstallCommand = Command.make(
  "uninstall",
  {
    skill: Argument.string("skill").pipe(
      Argument.withDescription("Name of the skill to uninstall"),
    ),
    yes: yesFlag,
    force: forceFlag,
    preview: previewFlag,
  },
  ({ skill, yes, force, preview }) =>
    withRuntime(
      withWorkspace(
        { scope: resolveWorkspaceScope(DEFAULT_WORKSPACE_SCOPE), agents: Option.none() },
        handleUninstall({ skill }),
      ),
      { command: "skills uninstall", flags: { yes, force, preview } },
    ),
).pipe(
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
