import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handleSkillsNew } from "./handler.js";

export interface SkillsNewCommandArgs {
  name: string;
  namespace: string | undefined;
  agent: string[] | undefined;
}

export const skillsNewCommand = {
  handler: async (argv: SkillsNewCommandArgs & Record<string, unknown>) => {
    await run(
      handleSkillsNew({
        name: argv.name,
        namespace: Option.fromUndefinedOr(argv.namespace),
        agents: Option.fromUndefinedOr(argv.agent),
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope: "project",
          agents: Option.fromUndefinedOr(argv.agent),
        },
        command: "skills new",
      },
    );
  },
};
