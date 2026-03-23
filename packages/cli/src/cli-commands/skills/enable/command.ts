import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { type WorkspaceScope, resolveWorkspaceScope } from "../../../workspace/scope.js";
import { handleEnable } from "./handler.js";

export interface EnableCommandArgs {
  name: string;
  scope: WorkspaceScope;
}

export const enableCommand = {
  handler: async (argv: EnableCommandArgs & Record<string, unknown>) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(
      handleEnable({
        name: argv.name,
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope,
          agents: Option.none(),
        },
        command: "skills enable",
      },
    );
  },
};
