import { Command } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { yesFlag } from "../../cli-flags/index.js";
import { handleLogin } from "../../cli-commands/auth/login/handler.js";

export const loginCommand = Command.make("login", { yes: yesFlag }, ({ yes }) =>
  withCommandRuntime(handleLogin(), { command: "auth login", flags: { yes } }),
).pipe(
  Command.withDescription("Sign in to a registry"),
  Command.withExamples([{ command: "axm login", description: "Sign in to the default registry" }]),
);
