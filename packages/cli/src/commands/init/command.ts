import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { CommandModule } from "yargs";
import { ClackLive } from "../../services/clack-effect/service.js";
import { InteractionContextLive } from "../../services/interaction-context/service.js";
import { handleInit } from "./handler.js";

interface InitArgs {
  global: boolean;
  agent: string[];
  yes: boolean;
  "non-interactive"?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
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
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all prompts; fail if user input is required",
        default: false,
      })
      .example("$0 init", "Detect installed agents and create .axm/settings.json")
      .example("$0 init --yes", "Initialize with all detected agents (non-interactive)")
      .example("$0 init --global", "Initialize in ~/.axm/ for user-wide configuration")
      .example("$0 init --agent claude-code --agent cursor", "Initialize with specific agents"),
  handler: async (argv) => {
    // Build layers: FileSystem + Clack -> InteractionContext
    const InteractionLayer = Layer.provide(InteractionContextLive, ClackLive);
    const MainLayer = Layer.merge(NodeFileSystem.layer, InteractionLayer);

    const program = handleInit({
      global: argv.global,
      agent: argv.agent,
      yes: argv.yes,
      nonInteractive: argv["non-interactive"],
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }),
      ),
      Effect.provide(MainLayer),
    );

    await Effect.runPromise(program);
  },
};
