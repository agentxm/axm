/**
 * Whoami command yargs definition -- wires handler to `axm auth whoami`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleWhoami } from "./handler.js";

export interface WhoamiCommandArgs {
  json: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const whoamiCommand: CommandModule<{}, WhoamiCommandArgs> = {
  command: "whoami",
  describe: "Show current authenticated identity",
  builder: (yargs) =>
    yargs.option("json", {
      type: "boolean",
      describe: "Output identity as JSON",
      default: false,
    }),
  handler: async (argv) => {
    await run(handleWhoami({ json: argv.json }), {
      flags: extractFlags(argv),
      command: "auth whoami",
    });
  },
};
