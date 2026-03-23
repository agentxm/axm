import { Command, Flag } from "effect/unstable/cli";

import { withCommandRuntime } from "../../command-runtime.js";
import { handleWhoami } from "../../cli-commands/auth/whoami/handler.js";

export const whoamiCommand = Command.make(
  "whoami",
  {
    json: Flag.boolean("json").pipe(Flag.withDescription("Output identity as JSON")),
  },
  ({ json }) => withCommandRuntime(handleWhoami({ json }), { command: "auth whoami" }),
).pipe(
  Command.withDescription("Show current authenticated identity"),
  Command.withExamples([
    { command: "axm whoami", description: "Show current authenticated identity" },
  ]),
);
