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
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const forkCommand: CommandModule<{}, ForkCommandArgs> = {
  command: "fork <source>",
  describe: "Fork a skill into a managed extension and publish to a registry",
  builder: (yargs) =>
    yargs
      .positional("source", {
        type: "string",
        describe: "Installed skill name, source string, or glob pattern",
        demandOption: true,
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip all confirmation prompts",
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
      .example("$0 skills fork github:owner/repo", "Fork a skill from a GitHub repo")
      .example('$0 skills fork "effect-*"', "Fork all installed skills matching the glob"),
  handler: async (argv) => {
    await run(
      handleFork({
        source: argv.source,
        yes: argv.yes,
      }),
      {
        workspace: {
          global: false,
          yes: argv.yes,
          nonInteractive: Option.fromNullable(argv["non-interactive"]),
          preview: argv.preview,
          agents: Option.none(),
        },
      },
    );
  },
};
