import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../runtime/index.js";
import { handleInit } from "./handler.js";

interface InitArgs {
  global: boolean;
  agent: ReadonlyArray<string>;
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
    await run(handleInit(), {
      workspace: {
        global: argv.global,
        yes: argv.yes,
        nonInteractive: Option.fromNullable(argv["non-interactive"]),
        preview: false,
        ...(argv.agent.length > 0 && { agents: argv.agent }),
      },
    });
  },
};
