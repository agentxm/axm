import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import type { CommandModule } from "yargs";
import { handleInit } from "./handler.js";

interface InitArgs {
  global: boolean;
  agent: string[];
  yes: boolean;
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
  "non-interactive"?: boolean;
}

// biome-ignore lint/complexity/noBannedTypes: {} is the yargs convention for no parent args
export const initCommand: CommandModule<{}, InitArgs> = {
  command: "init",
  describe: "Initialize axm by detecting installed agents and creating .axm/settings.json",
  builder: (yargs) =>
    yargs
      .option("global", {
        type: "boolean",
        describe: "Initialize globally in ~/.axm/ instead of the current directory",
        default: false,
      })
      .option("agent", {
        type: "string",
        array: true,
        describe: "Specify agent(s) to configure (skips auto-detection)",
        default: [],
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Use all detected agents without prompting",
        default: false,
      })
      .example("$0 init", "Detect installed agents and create .axm/settings.json")
      .example("$0 init --yes", "Initialize with all detected agents (non-interactive)")
      .example("$0 init --global", "Initialize in ~/.axm/ for user-wide configuration")
      .example("$0 init --agent claude-code --agent cursor", "Initialize with specific agents"),
  handler: async (argv) => {
    const program = handleInit({
      global: argv.global,
      agent: argv.agent,
      yes: argv.yes,
      verbose: argv.verbose,
      quiet: argv.quiet,
      json: argv.json,
      nonInteractive: argv["non-interactive"],
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }),
      ),
      Effect.provide(NodeFileSystem.layer),
    );

    await Effect.runPromise(program);
  },
};
