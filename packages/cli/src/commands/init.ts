import { NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import type { CommandModule } from "yargs";
import { handleInit } from "./init.handler.js";

interface InitArgs {
  global: boolean;
  agent: string[];
  yes: boolean;
}

// biome-ignore lint/complexity/noBannedTypes: {} is the yargs convention for no parent args
export const initCommand: CommandModule<{}, InitArgs> = {
  command: "init",
  describe: "Initialize axm in the current directory",
  builder: (yargs) =>
    yargs
      .option("global", {
        type: "boolean",
        describe: "Initialize globally in ~/.axm/",
        default: false,
      })
      .option("agent", {
        type: "string",
        array: true,
        describe: "Target agent(s) to configure",
        default: [],
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmations",
        default: false,
      })
      .example("$0 init", "Initialize axm with auto-detected agents")
      .example("$0 init --global", "Initialize axm globally")
      .example("$0 init --agent claude-code --agent cursor", "Initialize with specific agents"),
  handler: async (argv) => {
    const program = handleInit({
      global: argv.global,
      agent: argv.agent,
      yes: argv.yes,
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
