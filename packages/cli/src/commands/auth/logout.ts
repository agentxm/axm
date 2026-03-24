import { Command } from "effect/unstable/cli";

import { withRuntime } from "../../runtime.js";
import { handleLogout } from "../../cli-commands/auth/logout/handler.js";

export const logoutCommand = Command.make("logout", {}, () =>
  withRuntime(handleLogout(), { command: "auth logout" }),
).pipe(Command.withDescription("Sign out of a registry"));
