import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handlePacksAdd } from "./handler.js";

export interface PacksAddCommandArgs {
  pack: string;
  extension: string;
}

export const packsAddCommand = {
  handler: async (argv: PacksAddCommandArgs & Record<string, unknown>) => {
    await run(
      handlePacksAdd({
        pack: argv.pack,
        extension: argv.extension,
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope: "project",
          agents: Option.none(),
        },
        command: "packs add",
      },
    );
  },
};
