import * as Console from "effect/Console";
import { Argument, Command, Flag } from "effect/unstable/cli";

export const newCommand = Command.make(
  "new",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Name of the skill (without namespace)"),
    ),
    namespace: Flag.string("namespace").pipe(
      Flag.withDescription("Override the workspace namespace (e.g., @acme)"),
      Flag.optional,
    ),
    agent: Flag.string("agent").pipe(
      Flag.withDescription("Agent IDs to target (can be repeated)"),
      Flag.atLeast(1),
      Flag.optional,
    ),
  },
  (config) => Console.log(`[stub] skills new name=${config.name}`),
).pipe(
  Command.withDescription("Create a new skill"),
  Command.withExamples([
    { command: "axm-spike skills new my-skill", description: "Create a new skill" },
    {
      command: "axm-spike skills new my-skill --namespace @acme",
      description: "Create with custom namespace",
    },
  ]),
);
