import { FetchHttpClient } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import type { CommandModule } from "yargs";
import { handleInstall } from "./handler.js";

interface InstallArgs {
  source: string;
  global: boolean;
  agent: string[];
  skill: string[];
  yes: boolean;
  list: boolean;
  all: boolean;
  force: boolean;
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
  "non-interactive"?: boolean;
  "dry-run"?: boolean;
}

// biome-ignore lint/complexity/noBannedTypes: {} is the yargs convention for no parent args
export const installCommand: CommandModule<{}, InstallArgs> = {
  command: "install <source>",
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
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "Overwrite existing skills",
        default: false,
      })
      .option("dry-run", {
        type: "boolean",
        describe: "Show what would be installed without making changes",
        default: false,
      })
      .option("json", {
        type: "boolean",
        describe: "Output the plan as JSON (useful with --dry-run)",
        default: false,
      })
      .example("$0 skills install owner/repo", "Clone GitHub repo and install skills interactively")
      .example(
        "$0 skills install owner/repo@v1.0.0",
        "Install from a specific tag, branch, or commit",
      )
      .example("$0 skills install ./path/to/skills", "Install from a local directory")
      .example(
        "$0 skills install https://example.com",
        "Discover skills via /.well-known/skills/index.json",
      )
      .example("$0 skills install owner/repo --list", "List available skills without installing")
      .example(
        "$0 skills install owner/repo --all --yes",
        "Install all skills to all agents (CI mode)",
      )
      .example(
        "$0 skills install owner/repo --skill pr-review --agent claude-code",
        "Install specific skill to specific agent",
      )
      .example(
        "$0 skills install owner/repo --dry-run",
        "Preview installation plan without changes",
      )
      .example("$0 skills install owner/repo --dry-run --json", "Output installation plan as JSON"),
  handler: async (argv) => {
    const program = handleInstall({
      source: argv.source,
      global: argv.global,
      agent: argv.agent,
      skill: argv.skill,
      yes: argv.yes,
      list: argv.list,
      all: argv.all,
      force: argv.force,
      verbose: argv.verbose,
      quiet: argv.quiet,
      json: argv.json,
      nonInteractive: argv["non-interactive"],
      dryRun: argv["dry-run"],
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }),
      ),
      Effect.provide(Layer.merge(NodeContext.layer, FetchHttpClient.layer)),
    );

    await Effect.runPromise(program);
  },
};
