import { Command } from "effect/unstable/cli";

import { withRuntime } from "../../runtime.js";
import { yesFlag } from "@axm.sh/core/unstable/cli-flags";
import { handleLogin } from "../../cli-commands/auth/login/handler.js";

export const loginCommand = Command.make("login", { yes: yesFlag }, ({ yes }) =>
  withRuntime(handleLogin(), { command: "auth login", flags: { yes } }),
).pipe(
  Command.withDescription("Sign in to a registry"),
  Command.withExamples([{ command: "axm login", description: "Sign in to the default registry" }]),
);
