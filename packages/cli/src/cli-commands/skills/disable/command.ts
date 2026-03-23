import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { type WorkspaceScope, resolveWorkspaceScope } from "../../../workspace/scope.js";
import { handleDisable } from "./handler.js";

export interface DisableCommandArgs {
  name: string;
  scope: WorkspaceScope;
}

export const disableCommand = {
  handler: async (argv: DisableCommandArgs & Record<string, unknown>) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(
      handleDisable({
        name: argv.name,
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope,
          agents: Option.none(),
        },
        command: "skills disable",
      },
    );
  },
};
