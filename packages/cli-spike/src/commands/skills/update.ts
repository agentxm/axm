import * as Console from "effect/Console";
import { Argument, Command, Flag } from "effect/unstable/cli";

export const updateCommand = Command.make(
  "update",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription("Filter to skills from a specific source"),
      Argument.optional,
    ),
    scope: Flag.choice("scope", ["project", "user"] as const).pipe(
      Flag.withDescription("Configuration scope"),
      Flag.withDefault("project" as const),
    ),
    agent: Flag.string("agent").pipe(
      Flag.withDescription("Update only skills for specified agent(s)"),
      Flag.atLeast(0),
    ),
    skill: Flag.string("skill").pipe(
      Flag.withDescription("Update only specified skill(s) by name or glob"),
      Flag.atLeast(0),
    ),
  },
  (config) => Console.log(`[stub] skills update scope=${config.scope}`),
).pipe(
  Command.withDescription("Update installed skills to latest versions"),
  Command.withExamples([
    { command: "axm-spike skills update", description: "Update all installed skills" },
    {
      command: "axm-spike skills update owner/repo",
      description: "Update skills from a specific source",
    },
    {
      command: "axm-spike skills update --skill pr-review",
      description: "Update a specific skill",
    },
  ]),
);
