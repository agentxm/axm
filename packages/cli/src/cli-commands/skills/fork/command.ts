import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handleFork } from "./handler.js";

export interface ForkCommandArgs {
  source: string;
  skill: string[];
}

export const forkCommand = {
  handler: async (argv: ForkCommandArgs & Record<string, unknown>) => {
    await run(
      handleFork({
        source: argv.source,
        skills: argv.skill,
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope: "project",
          agents: Option.none<readonly string[]>(),
        },
        command: "skills fork",
      },
    );
  },
};
