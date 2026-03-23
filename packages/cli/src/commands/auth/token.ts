import { Command } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handleToken } from "../../cli-commands/auth/token/handler.js";

export const tokenCommand = Command.make("token", {}, () =>
  withCommandRuntime(handleToken(), { command: "auth token" }),
).pipe(
  Command.withDescription("Output current auth token to stdout"),
  Command.withExamples([
    { command: "axm token", description: "Output current auth token to stdout" },
  ]),
);
