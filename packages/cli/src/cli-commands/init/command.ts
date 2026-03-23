import * as Option from "effect/Option";
import { run } from "../../runtime/index.js";
import { extractFlags } from "../../cli-flags/index.js";
import { handleInit } from "./handler.js";
import { type WorkspaceScope, resolveWorkspaceScope } from "../../workspace/scope.js";

interface InitArgs {
  scope: WorkspaceScope;
  agent: ReadonlyArray<string>;
}

export const initCommand = {
  handler: async (argv: InitArgs & Record<string, unknown>) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(handleInit(), {
      flags: extractFlags(argv),
      workspace: {
        scope,
        agents: argv.agent.length > 0 ? Option.some(argv.agent) : Option.none(),
      },
      command: "init",
    });
  },
};
