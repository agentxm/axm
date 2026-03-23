import { run } from "../../../runtime/index.js";
import { extractFlags } from "../../../cli-flags/index.js";
import { handleLogout } from "./handler.js";

export type LogoutCommandArgs = Record<string, never>;

export const makeLogoutEffect = () => handleLogout();

export const logoutCommand = {
  handler: async (argv: LogoutCommandArgs & Record<string, unknown>) => {
    await run(makeLogoutEffect(), { flags: extractFlags(argv), command: "auth logout" });
  },
};
