/**
 * Login command yargs definition -- wires handler to `axm auth login`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleLogin } from "./handler.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export interface LoginCommandArgs {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const loginCommand: CommandModule<{}, LoginCommandArgs> = {
  command: "login",
  describe: "Sign in to a registry",
  builder: (yargs) => yargs,
  handler: async (argv) => {
    await run(handleLogin(), { flags: extractFlags(argv), command: "auth login" });
  },
};
