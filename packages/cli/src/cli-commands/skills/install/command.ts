import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleInstall } from "./handler.js";

interface InstallCommandArgs {
  source: string;
  global: boolean;
  agent: ReadonlyArray<string>;
  skill: ReadonlyArray<string>;
  yes: boolean;
  list: boolean;
  all: boolean;
  force: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const installCommand: CommandModule<{}, InstallCommandArgs> = {
  command: "install <source>",
  describe: "Install skills from GitHub or local path",
  builder: (yargs) =>
    yargs
      .positional("source", {
        type: "string",
        describe: "GitHub shorthand (owner/repo), local path, or URL",
        demandOption: true,
      })
      .option("global", {
        type: "boolean",
        describe: "Install to global ~/.axm/ instead of local .axm/",
        default: false,
      })
      .option("agent", {
        type: "string",
        array: true,
        describe: "Install only to specified agent(s)",
        default: [],
      })
      .option("skill", {
        type: "string",
        array: true,
        describe: "Install only specified skill(s) by name",
        default: [],
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("list", {
        alias: "l",
        type: "boolean",
        describe: "List available skills without installing",
        default: false,
      })
      .option("all", {
        type: "boolean",
        describe: "Install all discovered skills",
        default: false,
      })
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "Overwrite existing skills",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display installation plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .group(["global", "agent", "skill"], "Filtering:")
      .group(["yes", "list", "all", "force", "preview"], "Behavior:")
      .example("$0 skills install owner/repo", "Install skills interactively")
      .example(
        "$0 skills install owner/repo@v1.0.0",
        "Install from a specific tag, branch, or commit",
      )
      .example("$0 skills install ./path/to/skills", "Install from a local directory")
      .example("$0 skills install owner/repo --list", "List available skills without installing")
      .example("$0 skills install owner/repo --all --yes", "Install all without prompts")
      .example(
        "$0 skills install owner/repo --skill pr-review --agent claude-code",
        "Target specific skill and agent",
      ),
  handler: async (argv) => {
    await run(
      handleInstall({
        source: argv.source,
        global: argv.global,
        agents: argv.agent,
        skills: argv.skill,
        yes: argv.yes,
        list: argv.list,
        all: argv.all,
        force: argv.force,
        nonInteractive: Option.fromNullable(argv["non-interactive"]),
      }),
      {
        workspace: {
          global: argv.global,
          yes: argv.yes,
          nonInteractive: Option.fromNullable(argv["non-interactive"]),
          preview: argv.preview,
          agents: Option.none(),
        },
      },
    );
  },
};
