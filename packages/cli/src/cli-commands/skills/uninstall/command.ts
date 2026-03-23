import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { SkillManagerLive } from "../../../extensions/skills/manager.js";
import { run } from "../../../runtime/index.js";
import { UninstallSkillCommandWorkflowActionsLive } from "./command-actions.js";
import { handleUninstall } from "./handler.js";

export interface UninstallCommandArgs {
  skill: string;
}

export const uninstallCommand = {
  handler: async (argv: UninstallCommandArgs & Record<string, unknown>) => {
    const actionsLayer = Layer.provide(UninstallSkillCommandWorkflowActionsLive, SkillManagerLive);

    await run(
      handleUninstall({
        skill: argv.skill,
      }).pipe(Effect.provide(actionsLayer)),
      {
        flags: extractFlags(argv),
        workspace: {
          scope: "project",
          agents: Option.none<readonly string[]>(),
        },
        command: "skills uninstall",
      },
    );
  },
};
