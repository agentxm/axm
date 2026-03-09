/**
 * Token command yargs definition -- wires handler to `axm auth token`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleToken } from "./handler.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export interface TokenCommandArgs {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const tokenCommand: CommandModule<{}, TokenCommandArgs> = {
  command: "token",
  describe: "Output current auth token to stdout",
  builder: (yargs) => yargs,
  handler: async (argv) => {
    await run(handleToken(), { flags: extractFlags(argv), command: "auth token" });
  },
};
