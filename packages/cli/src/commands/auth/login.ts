import { Command } from "effect/unstable/cli";

import { withRuntime } from "../../runtime.js";
import { yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleLogin } from "../../cli-commands/auth/login/handler.js";

const loginConfig = { yes: yesFlag } as const;

export const loginCommand = Command.make("login", loginConfig, () =>
  withRuntime(handleLogin(), { command: "auth login" }),
).pipe(
  withArgvTracking(loginConfig),
  Command.withDescription("Sign in to a registry"),
  Command.withExamples([{ command: "axm login", description: "Sign in to the default registry" }]),
);
