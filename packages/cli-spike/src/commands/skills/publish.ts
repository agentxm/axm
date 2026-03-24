import * as Console from "effect/Console";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { yesFlag } from "@axm.sh/core/unstable/cli-flags";

export const publishCommand = Command.make(
  "publish",
  {
    extensions: Argument.string("extensions").pipe(
      Argument.withDescription("Extension names or glob patterns"),
      Argument.atLeast(1),
    ),
    registry: Flag.string("registry").pipe(
      Flag.withDescription("Named registry source to publish to"),
      Flag.optional,
    ),
    yes: yesFlag,
  },
  (config) =>
    Console.log(
      `[stub] skills publish extensions=${config.extensions.join(", ")} yes=${config.yes}`,
    ),
).pipe(
  Command.withDescription("Publish extensions to a registry"),
  Command.withExamples([
    {
      command: "axm-spike skills publish @acme/skills/code-review",
      description: "Publish a single extension",
    },
    {
      command: "axm-spike skills publish effect-* commit",
      description: "Publish matching patterns",
    },
    {
      command: "axm-spike skills publish @acme/skills/code-review --yes",
      description: "Publish without confirmation",
    },
  ]),
);
