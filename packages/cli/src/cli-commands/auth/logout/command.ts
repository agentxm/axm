/**
 * Logout command yargs definition -- wires handler to `axm auth logout`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleLogout } from "./handler.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export interface LogoutCommandArgs {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const logoutCommand: CommandModule<{}, LogoutCommandArgs> = {
  command: "logout",
  describe: "Sign out of a registry",
  builder: (yargs) => yargs,
  handler: async (argv) => {
    await run(handleLogout(), { flags: extractFlags(argv), command: "auth logout" });
  },
};
