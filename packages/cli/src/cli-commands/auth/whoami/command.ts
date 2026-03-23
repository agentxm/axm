import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleWhoami } from "./handler.js";

export interface WhoamiCommandArgs {
  json: boolean;
}

export const makeWhoamiEffect = (args: WhoamiCommandArgs) => handleWhoami({ json: args.json });

export const whoamiCommand = {
  handler: async (argv: WhoamiCommandArgs & Record<string, unknown>) => {
    await run(makeWhoamiEffect({ json: argv.json }), {
      flags: extractFlags(argv),
      command: "auth whoami",
    });
  },
};
