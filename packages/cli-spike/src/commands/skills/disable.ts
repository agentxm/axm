import * as Console from "effect/Console";
import { Argument, Command, Flag } from "effect/unstable/cli";

export const disableCommand = Command.make(
  "disable",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to disable")),
    scope: Flag.choice("scope", ["project", "user"] as const).pipe(
      Flag.withDescription("Configuration scope"),
      Flag.withDefault("project" as const),
    ),
  },
  (config) => Console.log(`[stub] skills disable name=${config.name} scope=${config.scope}`),
).pipe(Command.withDescription("Disable a skill without uninstalling it"));
