import { Command } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handleLogin } from "../../cli-commands/auth/login/handler.js";

export const loginCommand = Command.make("login", {}, () =>
  withCommandRuntime(handleLogin(), { command: "auth login" }),
).pipe(
  Command.withDescription("Sign in to a registry"),
  Command.withExamples([{ command: "axm login", description: "Sign in to the default registry" }]),
);
