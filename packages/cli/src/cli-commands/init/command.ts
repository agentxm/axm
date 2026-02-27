import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../runtime/index.js";
import { handleInit } from "./handler.js";
import {
  WORKSPACE_SCOPES,
  DEFAULT_WORKSPACE_SCOPE,
  type WorkspaceScope,
  resolveWorkspaceScope,
} from "../../workspace/scope.js";

interface InitArgs {
  scope: WorkspaceScope;
  agent: ReadonlyArray<string>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const initCommand: CommandModule<{}, InitArgs> = {
  command: "init",
  describe: "Set up axm in the current project",
  builder: (yargs) =>
    yargs
      .option("scope", {
        type: "string",
        choices: WORKSPACE_SCOPES,
        describe: "Configuration scope: project (default) or user",
        default: DEFAULT_WORKSPACE_SCOPE,
      })
      .option("agent", {
        type: "string",
        array: true,
        describe: "Specify agent(s) to configure (skips auto-detection)",
        default: [],
      })
      .example("$0 init", "Detect installed agents and create .axm/settings.json")
      .example("$0 init --non-interactive", "Initialize with all detected agents (no prompts)")
      .example("$0 init --scope user", "Initialize in ~/.axm/ for user-scope configuration")
      .example("$0 init --agent claude-code --agent cursor", "Initialize with specific agents"),
  handler: async (argv) => {
    const scope = resolveWorkspaceScope(argv.scope);
    await run(handleInit(), {
      flags: {
        nonInteractive: Option.fromNullable(argv["non-interactive"] as boolean | undefined),
        yes: argv["yes"] as boolean,
        force: argv["force"] as boolean,
        preview: argv["preview"] as boolean,
      },
      workspace: {
        scope,
        agents: argv.agent.length > 0 ? Option.some(argv.agent) : Option.none(),
      },
    });
  },
};
