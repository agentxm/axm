/**
 * Disable command yargs definition - wires handler to `axm skills disable`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandModule } from "yargs";
import * as Option from "effect/Option";
import { run } from "../../../runtime/index.js";
import { handleDisable } from "./handler.js";
import {
  CONFIGURATION_SCOPES,
  DEFAULT_CONFIGURATION_SCOPE,
  type ConfigurationScope,
  resolveConfigurationScope,
  toGlobalWorkspaceFlag,
} from "../../../workspace/config-scope.js";

export interface DisableCommandArgs {
  name: string;
  scope: ConfigurationScope;
  global?: boolean;
  yes: boolean;
  preview: boolean;
  "non-interactive": boolean | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- yargs convention
export const disableCommand: CommandModule<{}, DisableCommandArgs> = {
  command: "disable <name>",
  describe: "Disable a skill without uninstalling it",
  builder: (yargs) =>
    yargs
      .positional("name", {
        type: "string",
        describe: "Name of the skill to disable",
        demandOption: true,
      })
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
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
        default: false,
      })
      .option("preview", {
        type: "boolean",
        describe: "Display plan without applying",
        default: false,
      })
      .option("non-interactive", {
        type: "boolean",
        describe: "Disable all interactive prompts",
      })
      .example("$0 skills disable my-skill", "Disable a skill without uninstalling")
      .example("$0 skills disable my-skill --preview", "Preview what would be disabled"),
  handler: async (argv) => {
    const scope = resolveConfigurationScope(argv.scope, argv.global);
    await run(
      handleDisable({
        name: argv.name,
        yes: argv.yes,
      }),
      {
        workspace: {
          global: toGlobalWorkspaceFlag(scope),
          yes: argv.yes,
          nonInteractive: Option.fromNullable(argv["non-interactive"]),
          preview: argv.preview,
          agents: Option.none(),
        },
      },
    );
  },
};
