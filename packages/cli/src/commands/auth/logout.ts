import { Command } from "effect/unstable/cli";

import { withRuntime } from "../../runtime.js";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleLogout } from "../../cli-commands/auth/logout/handler.js";

const logoutConfig = {} as const;

export const logoutCommand = Command.make("logout", logoutConfig, () =>
  withRuntime(handleLogout(), { command: "auth logout" }),
).pipe(withArgvTracking(logoutConfig), Command.withDescription("Sign out of a registry"));
