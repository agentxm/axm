import * as Console from "effect/Console";
import { Command, Flag } from "effect/unstable/cli";

export const listCommand = Command.make(
  "list",
  {
    scope: Flag.choice("scope", ["project", "user"] as const).pipe(
      Flag.withDescription("Configuration scope"),
      Flag.withDefault("project" as const),
    ),
    agent: Flag.string("agent").pipe(Flag.withDescription("Filter by agent(s)"), Flag.atLeast(0)),
  },
  (config) => Console.log(`[stub] skills list scope=${config.scope}`),
).pipe(
  Command.withAlias("ls"),
  Command.withDescription("List installed skills"),
  Command.withExamples([
    { command: "axm-spike skills list", description: "List all installed skills" },
    { command: "axm-spike skills list --scope user", description: "List user-scope skills" },
    {
      command: "axm-spike skills list --agent claude-code",
      description: "List skills for an agent",
    },
  ]),
);
