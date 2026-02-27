/**
 * Skills new command yargs definition — wires handler to `axm skills new`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleSkillsNew } from "./handler.js";

export interface SkillsNewCommandArgs {
  name: string;
  namespace: string | undefined;
  agent: string[] | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const skillsNewCommand: CommandModule<{}, SkillsNewCommandArgs> = {
  command: "new <name>",
  describe: "Create a new skill",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Name of the skill (without namespace)",
        demandOption: true,
      })
      .option("namespace", {
        type: "string",
        describe: "Override the workspace namespace (e.g., @acme)",
      })
      .option("agent", {
        type: "string",
        array: true,
        describe: "Agent IDs to target (can be repeated)",
      })
      .example("$0 skills new my-skill", "Create a new skill")
      .example("$0 skills new my-skill --namespace @acme", "Create with custom namespace"),
  handler: async (argv) => {
    await run(
      handleSkillsNew({
        name: argv.name,
        namespace: Option.fromNullable(argv.namespace),
        agents: Option.fromNullable(argv.agent),
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope: "project",
          agents: Option.fromNullable(argv.agent),
        },
        command: "skills new",
      },
    );
  },
};
