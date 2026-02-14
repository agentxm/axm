/**
 * Disable command yargs definition - wires handler to `axm skills disable`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleDisable } from "./handler.js";

export interface DisableCommandArgs {
  name: string;
  global: boolean;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const disableCommand: CommandModule<{}, DisableCommandArgs> = {
  command: "disable <name>",
  describe: "Disable a skill without uninstalling it",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Name of the skill to disable",
        demandOption: true,
      })
      .option("global", {
        type: "boolean",
        describe: "Use global ~/.axm/ workspace",
        default: false,
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .example("$0 skills disable my-skill", "Disable a skill without uninstalling")
      .example("$0 skills disable my-skill --preview", "Preview what would be disabled"),
  handler: async (argv) => {
    await run(
      handleDisable({
        name: argv.name,
        yes: argv.yes,
      }),
      {
        workspace: {
          global: argv.global,
          yes: argv.yes,
          nonInteractive: Option.fromNullable(argv["non-interactive"]),
          preview: argv.preview,
          agents: Option.none(),
        },
      },
    );
  },
};
