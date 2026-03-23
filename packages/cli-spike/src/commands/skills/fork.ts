import * as Console from "effect/Console";
import { Argument, Command, Flag } from "effect/unstable/cli";

export const forkCommand = Command.make(
  "fork",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription("Installed skill name, glob pattern, or source string"),
    ),
    skill: Flag.string("skill").pipe(
      Flag.withDescription("Fork only specified skill(s) by name or glob pattern"),
      Flag.atLeast(0),
    ),
  },
  (config) => Console.log(`[stub] skills fork source=${config.source}`),
).pipe(
  Command.withDescription("Fork a skill for customization"),
  Command.withExamples([
    { command: "axm-spike skills fork my-skill", description: "Fork an installed skill" },
    { command: "axm-spike skills fork github:owner/repo", description: "Fork from GitHub" },
  ]),
);
