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
      }),
      {
        flags: {
          nonInteractive: Option.fromNullable(argv["non-interactive"] as boolean | undefined),
          yes: argv["yes"] as boolean,
          force: argv["force"] as boolean,
          preview: argv["preview"] as boolean,
        },
        workspace: {
          scope: "project",
          agents: Option.none(),
        },
      },
    );
  },
};
