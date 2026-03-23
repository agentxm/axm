import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { type WorkspaceScope, resolveWorkspaceScope } from "../../../workspace/scope.js";
import { handleList } from "./handler.js";

export interface ListCommandArgs {
  scope: WorkspaceScope;
  agent: ReadonlyArray<string>;
}

export const listCommand = {
  handler: async (argv: ListCommandArgs & Record<string, unknown>) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(
      handleList({
        agents: argv.agent,
      }),
      {
        flags: {
          nonInteractive: Option.some(true),
          yes: true,
          force: false,
          preview: false,
        },
        workspace: {
          scope,
          agents: Option.none(),
        },
        command: "skills list",
      },
    );
  },
};
