/**
 * Packs add command yargs definition — wires handler to `axm packs add`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handlePacksAdd } from "./handler.js";

export interface PacksAddCommandArgs {
  pack: string;
  extension: string;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const packsAddCommand: CommandModule<{}, PacksAddCommandArgs> = {
  command: "add <pack> <extension>",
  describe: "Add an extension to a pack manifest",
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
        "$0 packs add frontend-tools @acme/skills/code-review",
        "Add a specific extension to a pack",
      )
      .example('$0 packs add my-pack "effect-*"', "Add all matching extensions via glob"),
  handler: async (argv) => {
    await run(
      handlePacksAdd({
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
