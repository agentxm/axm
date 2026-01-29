import { FetchHttpClient } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import type { CommandModule } from "yargs";
import { handleAdd } from "./add.handler.js";

interface AddArgs {
  source: string;
  global: boolean;
  agent: string[];
  skill: string[];
  yes: boolean;
  list: boolean;
  all: boolean;
}

// biome-ignore lint/complexity/noBannedTypes: {} is the yargs convention for no parent args
export const addCommand: CommandModule<{}, AddArgs> = {
  command: "add <source>",
  describe: "Install skills from a GitHub repo, local path, or URL",
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
        describe: "Skip all confirmation prompts",
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
      .example("$0 skills add owner/repo", "Clone GitHub repo and install skills interactively")
      .example("$0 skills add owner/repo@v1.0.0", "Install from a specific tag, branch, or commit")
      .example("$0 skills add ./path/to/skills", "Install from a local directory")
      .example(
        "$0 skills add https://example.com",
        "Discover skills via /.well-known/skills/index.json",
      )
      .example("$0 skills add owner/repo --list", "List available skills without installing")
      .example("$0 skills add owner/repo --all --yes", "Install all skills to all agents (CI mode)")
      .example(
        "$0 skills add owner/repo --skill pr-review --agent claude-code",
        "Install specific skill to specific agent",
      ),
  handler: async (argv) => {
    const program = handleAdd({
      source: argv.source,
      global: argv.global,
      agent: argv.agent,
      skill: argv.skill,
      yes: argv.yes,
      list: argv.list,
      all: argv.all,
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }),
      ),
      Effect.provide(NodeContext.layer),
      Effect.provide(FetchHttpClient.layer),
    );

    await Effect.runPromise(program);
  },
};
