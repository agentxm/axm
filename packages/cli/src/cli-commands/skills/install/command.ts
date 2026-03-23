import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { SkillManagerLive } from "../../../extensions/skills/manager.js";
import { run } from "../../../runtime/index.js";
import { type WorkspaceScope, resolveWorkspaceScope } from "../../../workspace/scope.js";
import { InstallSkillCommandWorkflowActionsLive } from "./command-actions.js";
import { handleInstall } from "./handler.js";

interface InstallCommandArgs {
  source: string;
  scope: WorkspaceScope;
  skill: ReadonlyArray<string>;
  all: boolean;
}

export const installCommand = {
  handler: async (argv: InstallCommandArgs & Record<string, unknown>) => {
    const scope = resolveWorkspaceScope(argv.scope);
    const actionsLayer = Layer.provide(InstallSkillCommandWorkflowActionsLive, SkillManagerLive);

    await run(
      handleInstall({
        source: argv.source,
        scope,
        skills: argv.skill,
        all: argv.all,
      }).pipe(Effect.provide(actionsLayer)),
      {
        flags: extractFlags(argv),
        workspace: {
          scope,
          agents: Option.none(),
        },
        command: "skills install",
      },
    );
  },
};
