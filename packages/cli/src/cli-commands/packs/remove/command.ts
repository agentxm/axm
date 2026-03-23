import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handlePacksRemove } from "./handler.js";

export interface PacksRemoveCommandArgs {
  pack: string;
  extension: string;
}

export const packsRemoveCommand = {
  handler: async (argv: PacksRemoveCommandArgs & Record<string, unknown>) => {
    await run(
      handlePacksRemove({
        pack: argv.pack,
        extension: argv.extension,
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope: "project",
          agents: Option.none(),
        },
        command: "packs remove",
      },
    );
  },
};
