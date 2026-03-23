import * as Console from "effect/Console";
import { Argument, Command, Flag } from "effect/unstable/cli";

export const installCommand = Command.make(
  "install",
  {
    source: Argument.string("source").pipe(
      Argument.withDescription("GitHub shorthand (owner/repo), local path, or URL"),
    ),
    scope: Flag.choice("scope", ["project", "user"] as const).pipe(
      Flag.withDescription("Configuration scope"),
      Flag.withDefault("project" as const),
    ),
    skill: Flag.string("skill").pipe(
      Flag.withDescription("Install only specified skill(s) by name"),
      Flag.atLeast(0),
    ),
    all: Flag.boolean("all").pipe(Flag.withDescription("Install all discovered skills")),
  },
  (config) =>
    Console.log(
      `[stub] skills install source=${config.source} scope=${config.scope} all=${config.all}`,
    ),
).pipe(
  Command.withDescription("Install skills from GitHub or local path"),
  Command.withExamples([
    { command: "axm-spike skills install owner/repo", description: "Install skills interactively" },
    {
      command: "axm-spike skills install owner/repo@v1.0.0",
      description: "Install from a specific version",
    },
    {
      command: "axm-spike skills install ./local/path",
      description: "Install from a local directory",
    },
    {
      command: "axm-spike skills install owner/repo --all --yes",
      description: "Install all without prompts",
    },
    {
      command: "axm-spike skills install owner/repo --skill pr-review",
      description: "Target a specific skill",
    },
  ]),
);
