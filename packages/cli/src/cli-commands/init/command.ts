import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../runtime/index.js";
import { handleInit } from "./handler.js";
import {
  CONFIGURATION_SCOPES,
  DEFAULT_CONFIGURATION_SCOPE,
  type ConfigurationScope,
  resolveConfigurationScope,
  toGlobalWorkspaceFlag,
} from "../../workspace/config-scope.js";

interface InitArgs {
  scope: ConfigurationScope;
  global?: boolean;
  agent: ReadonlyArray<string>;
  yes: boolean;
  "non-interactive"?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const initCommand: CommandModule<{}, InitArgs> = {
  command: "init",
  describe: "Set up axm in the current project",
  builder: (yargs) =>
    yargs
      .option("scope", {
        type: "string",
        choices: CONFIGURATION_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_CONFIGURATION_SCOPE,
      })
      .option("global", {
        type: "boolean",
        hidden: true,
        describe: "Deprecated alias for --scope user",
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
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
        default: false,
      })
      .example("$0 init", "Detect installed agents and create .axm/settings.json")
      .example("$0 init --yes", "Initialize with all detected agents (non-interactive)")
      .example("$0 init --scope user", "Initialize in ~/.axm/ for user-scope configuration")
      .example("$0 init --agent claude-code --agent cursor", "Initialize with specific agents"),
  handler: async (argv) => {
    const scope = resolveConfigurationScope(argv.scope, argv.global);
    await run(handleInit(), {
      workspace: {
        global: toGlobalWorkspaceFlag(scope),
        yes: argv.yes,
        nonInteractive: Option.fromNullable(argv["non-interactive"]),
        preview: false,
        agents: argv.agent.length > 0 ? Option.some(argv.agent) : Option.none(),
      },
    });
  },
};
