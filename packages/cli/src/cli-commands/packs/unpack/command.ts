import * as Option from "effect/Option";
import { extractFlags } from "../../../cli-flags/index.js";
import { run } from "../../../runtime/index.js";
import { handleUnpack } from "./handler.js";

export interface UnpackCommandArgs {
  name: string;
  "strict-agent-sync": boolean;
}

export const unpackCommand = {
  handler: async (argv: UnpackCommandArgs & Record<string, unknown>) => {
    await run(
      handleUnpack({
        name: argv.name,
        strictAgentSync: argv["strict-agent-sync"],
      }),
      {
        flags: extractFlags(argv),
        workspace: {
          scope: "project",
          agents: Option.none(),
        },
        command: "packs unpack",
      },
    );
  },
};
