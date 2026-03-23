import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handlePacksNew } from "./handler.js";

export interface PacksNewCommandArgs {
  name: string;
  namespace: string | undefined;
}

export const packsNewCommand = {
  handler: async (argv: PacksNewCommandArgs & Record<string, unknown>) => {
    await run(
      handlePacksNew({
        name: argv.name,
        namespace: Option.fromUndefinedOr(argv.namespace),
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope: "project",
          agents: Option.none(),
        },
        command: "packs new",
      },
    );
  },
};
