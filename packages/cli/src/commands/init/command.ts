import { NodeFileSystem } from "@effect/platform-node";
import * as Effect from "effect/Effect"
import type { CommandModule } from "yargs";
import { handleInit } from "./handler.js";

interface InitArgs {
  global: boolean;
  agent: string[];
  yes: boolean;
  force: boolean;
  "non-interactive"?: boolean;
  "dry-run"?: boolean;
}

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
      .option("force", {
        alias: "f",
        type: "boolean",
        describe: "Re-initialize even if already initialized",
        default: false,
      })
      .option("dry-run", {
        type: "boolean",
        describe: "Show what would be done without making changes",
        default: false,
      })
      .example("$0 init", "Detect installed agents and create .axm/settings.json")
      .example("$0 init --yes", "Initialize with all detected agents (non-interactive)")
      .example("$0 init --global", "Initialize in ~/.axm/ for user-wide configuration")
      .example("$0 init --agent claude-code --agent cursor", "Initialize with specific agents")
      .example("$0 init --force", "Re-initialize workspace with new agent selection")
      .example("$0 init --dry-run", "Preview what would be done without making changes"),
  handler: async (argv) => {
    const program = handleInit({
      global: argv.global,
      agent: argv.agent,
      yes: argv.yes,
      force: argv.force,
      dryRun: argv["dry-run"] ?? false,
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
