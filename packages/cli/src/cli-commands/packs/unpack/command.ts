/**
 * Unpack command yargs definition -- wires handler to `axm packs unpack`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleUnpack } from "./handler.js";

export interface UnpackCommandArgs {
  name: string;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const unpackCommand: CommandModule<{}, UnpackCommandArgs> = {
  command: "unpack <name>",
  describe: "Eject pack into individual entries",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Pack name to unpack",
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
        describe: "Display unpack plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .example("$0 packs unpack @acme/frontend-tools", "Eject pack contents into settings")
      .example(
        "$0 packs unpack @acme/frontend-tools --preview",
        "See what would change in settings",
      ),
  handler: async (argv) => {
    await run(
      handleUnpack({
        name: argv.name,
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
