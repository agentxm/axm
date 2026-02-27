/**
 * Packs remove command yargs definition — wires handler to `axm packs remove`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handlePacksRemove } from "./handler.js";

export interface PacksRemoveCommandArgs {
  pack: string;
  extension: string;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const packsRemoveCommand: CommandModule<{}, PacksRemoveCommandArgs> = {
  command: "remove <pack> <extension>",
  describe: "Remove an extension from a pack manifest",
  builder: (yargs) =>
    yargs
      .positional("pack", {
        type: "string",
        describe: "Name of the pack",
        demandOption: true,
      })
      .positional("extension", {
        type: "string",
        describe: "Extension name or glob pattern",
        demandOption: true,
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
      .example(
        "$0 packs remove frontend-tools @acme/skills/code-review",
        "Remove a specific extension from a pack",
      )
      .example(
        '$0 packs remove my-pack "@acme/effect-*"',
        "Remove all matching extensions via glob",
      ),
  handler: async (argv) => {
    await run(
      handlePacksRemove({
        pack: argv.pack,
        extension: argv.extension,
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
