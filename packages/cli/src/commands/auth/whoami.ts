import { Command, Flag } from "effect/unstable/cli";

import { withRuntime } from "../../runtime.js";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";
import { handleWhoami } from "../../cli-commands/auth/whoami/handler.js";

const whoamiConfig = {
  json: Flag.boolean("json").pipe(Flag.withDescription("Output identity as JSON")),
} as const;

export const whoamiCommand = Command.make("whoami", whoamiConfig, ({ json }) =>
  withRuntime(handleWhoami({ json }), { command: "auth whoami" }),
).pipe(
  withArgvTracking(whoamiConfig),
  Command.withDescription("Show current authenticated identity"),
  Command.withExamples([
    { command: "axm whoami", description: "Show current authenticated identity" },
  ]),
);
