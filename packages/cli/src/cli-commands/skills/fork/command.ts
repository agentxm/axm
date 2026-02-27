/**
 * Fork command yargs definition — wires handler to `axm skills fork`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleFork } from "./handler.js";

export interface ForkCommandArgs {
  source: string;
  skill: string[];
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const forkCommand: CommandModule<{}, ForkCommandArgs> = {
  command: "fork <source>",
  describe: "Fork a skill for customization",
  builder: (yargs) =>
    yargs
      .positional("source", {
        type: "string",
        describe:
          "Installed skill name, glob pattern, or source string (local path, github:owner/repo, etc.)",
        demandOption: true,
      })
      .option("skill", {
        type: "string",
        array: true,
        describe: "Fork only specified skill(s) by name or glob pattern",
        default: [],
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display fork plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .example("$0 skills fork my-skill", "Fork an installed skill to a managed extension")
      .example(
        '$0 skills fork "effect-*"',
        "Fork all local skills matching the glob (installed, configured unmanaged, and on-disk)",
      )
      .example("$0 skills fork github:owner/repo", "Fork a skill from a GitHub repo")
      .example(
        '$0 skills fork ./local/path --skill "effect-*"',
        "Fork only skills matching the glob from a local source",
      ),
  handler: async (argv) => {
    await run(
      handleFork({
        source: argv.source,
        skills: argv.skill,
        yes: argv.yes,
      }),
      {
        workspace: {
          scope: "project",
          yes: argv.yes,
          nonInteractive: Option.fromNullable(argv["non-interactive"]),
          preview: argv.preview,
          agents: Option.none(),
        },
      },
    );
  },
};
