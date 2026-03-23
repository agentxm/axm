import * as Console from "effect/Console";
import { Argument, Command, Flag } from "effect/unstable/cli";

export const enableCommand = Command.make(
  "enable",
  {
    name: Argument.string("name").pipe(Argument.withDescription("Name of the skill to enable")),
    scope: Flag.choice("scope", ["project", "user"] as const).pipe(
      Flag.withDescription("Configuration scope"),
      Flag.withDefault("project" as const),
    ),
  },
  (config) => Console.log(`[stub] skills enable name=${config.name} scope=${config.scope}`),
).pipe(Command.withDescription("Enable a previously disabled skill"));
