import { Command } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handleLogout } from "../../cli-commands/auth/logout/handler.js";

export const logoutCommand = Command.make("logout", {}, () =>
  withCommandRuntime(handleLogout(), { command: "auth logout" }),
).pipe(Command.withDescription("Sign out of a registry"));
