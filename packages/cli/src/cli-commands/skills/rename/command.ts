/**
 * Rename command yargs definition - wires handler to `axm skills rename`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleRename } from "./handler.js";

export interface RenameCommandArgs {
  "old-name": string;
  "new-name": string;
  global: boolean;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const renameCommand: CommandModule<{}, RenameCommandArgs> = {
  command: "rename <old-name> <new-name>",
  describe: "Rename a skill",
  builder: (yargs) =>
    yargs
      .positional("old-name", {
        type: "string",
        describe: "Current name of the skill",
        demandOption: true,
      })
      .positional("new-name", {
        type: "string",
        describe: "New name for the skill",
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
      .example("$0 skills rename old-name new-name", "Rename a skill")
      .example("$0 skills rename old-name new-name --preview", "Preview what would be renamed"),
  handler: async (argv) => {
    await run(
      handleRename({
        oldName: argv["old-name"],
        newName: argv["new-name"],
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
