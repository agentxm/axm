import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { type WorkspaceScope, resolveWorkspaceScope } from "../../../workspace/scope.js";
import { handleUpdate } from "./handler.js";

interface UpdateCommandArgs {
  source: string | undefined;
  scope: WorkspaceScope;
  agent: ReadonlyArray<string>;
  skill: ReadonlyArray<string>;
}

export const updateCommand = {
  handler: async (argv: UpdateCommandArgs & Record<string, unknown>) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(
      handleUpdate({
        source: Option.fromUndefinedOr(argv.source),
        scope,
        agents: argv.agent,
        skills: argv.skill,
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope,
          agents: Option.none(),
        },
        command: "skills update",
      },
    );
  },
};
