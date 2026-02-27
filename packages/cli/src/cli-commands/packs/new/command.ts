/**
 * Packs new command yargs definition — wires handler to `axm packs new`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handlePacksNew } from "./handler.js";

export interface PacksNewCommandArgs {
  name: string;
  namespace: string | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const packsNewCommand: CommandModule<{}, PacksNewCommandArgs> = {
  command: "new <name>",
  describe: "Create a new empty extension pack",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Name of the pack (without namespace)",
        demandOption: true,
      })
      .option("namespace", {
        type: "string",
        describe: "Override the workspace namespace (e.g., @acme)",
      })
      .example("$0 packs new frontend-tools", "Create @<namespace>/frontend-tools")
      .example("$0 packs new frontend-tools --namespace @co", "Create @co/frontend-tools"),
  handler: async (argv) => {
    await run(
      handlePacksNew({
        name: argv.name,
        namespace: Option.fromNullable(argv.namespace),
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
