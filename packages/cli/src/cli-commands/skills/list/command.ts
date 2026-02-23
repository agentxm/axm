/**
 * List command yargs definition - wires handler to `axm skills list`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleList } from "./handler.js";
import {
  CONFIGURATION_SCOPES,
  DEFAULT_CONFIGURATION_SCOPE,
  type ConfigurationScope,
  resolveConfigurationScope,
  toGlobalWorkspaceFlag,
} from "../../../workspace/config-scope.js";

export interface ListCommandArgs {
  scope: ConfigurationScope;
  global?: boolean;
  agent: ReadonlyArray<string>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const listCommand: CommandModule<{}, ListCommandArgs> = {
  command: "list",
  aliases: ["ls"],
  describe: "List installed skills",
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
        describe: "Filter by agent(s)",
        default: [],
      })
      .example("$0 skills list", "List all installed skills")
      .example("$0 skills list --scope user", "List user-scope installed skills")
      .example("$0 skills list --agent claude-code", "List skills for a specific agent"),
  handler: async (argv) => {
    const scope = resolveConfigurationScope(argv.scope, argv.global);
    await run(
      handleList({
        agents: argv.agent,
      }),
      {
        workspace: {
          global: toGlobalWorkspaceFlag(scope),
          yes: true,
          nonInteractive: Option.some(true),
          preview: false,
          agents: Option.none(),
        },
      },
    );
  },
};
